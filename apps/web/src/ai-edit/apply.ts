import {
	AddTrackCommand,
	BatchCommand,
	type Command,
	DeleteElementsCommand,
	InsertElementCommand,
} from "@/commands";
import type { EditorCore } from "@/core";
import { buildDefaultEffectInstance } from "@/effects";
import { ADJUST_EFFECT_TYPE } from "@/effects/definitions/adjust";
import { ADJUST_PRESETS } from "@/effects/definitions/adjust-presets";
import type { MediaAsset } from "@/media/types";
import { buildCaptionTrackCommands } from "@/subtitles/insert";
import type { AudioElement } from "@/timeline";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { synthesizeAssets, type TtsVoiceSettings } from "@/tts/insert";
import { generateUUID } from "@/utils/id";
import { mediaTimeFromSeconds, subMediaTime } from "@/wasm";
import { type EditPlan, placeBeats } from "./plan";

// 내레이션이 깔리는 컷의 현장음(dB). 조리 소리는 남기되 목소리를 가리지 않게 낮춘다
const SOURCE_VOLUME_UNDER_VOICE_DB = -14;
const TRANSITION_SECONDS = 0.3;
const MIN_CAPTION_SECONDS = 0.3;

/**
 * 계획대로 타임라인을 새로 짠다. 있던 클립은 지우고 영상·내레이션·자막 트랙을 넣는데,
 * 전부 BatchCommand 하나라서 ⌘Z 한 번이면 AI 편집 전으로 돌아간다(합성한 음성 파일만 미디어 패널에 남는다).
 * voice가 null이면 내레이션 없이 자막만 넣는다
 */
export async function applyPlan({
	editor,
	plan,
	clips,
	voice,
	signal,
	onProgress,
}: {
	editor: EditorCore;
	plan: EditPlan;
	/** 계획의 클립 번호 → 미디어 */
	clips: Record<string, MediaAsset>;
	voice: { voiceSettings: TtsVoiceSettings; model: string } | null;
	signal: AbortSignal;
	onProgress: (progress: { current: number; total: number }) => void;
}): Promise<void> {
	const spoken = plan.beats
		.map((beat, index) => ({ index, text: beat.narration }))
		.filter((line) => voice && line.text);
	const voiceAssets = voice
		? await synthesizeAssets({
				editor,
				sentences: spoken.map((line) => line.text),
				voiceSettings: voice.voiceSettings,
				signal,
				onProgress,
			})
		: [];
	const voiceOf = new Map(spoken.map((line, order) => [line.index, voiceAssets[order]]));

	const durations = Object.fromEntries(
		Object.entries(clips).map(([id, asset]) => [id, asset.duration ?? 0]),
	);
	const placed = placeBeats({
		beats: plan.beats,
		voices: plan.beats.map((_, index) => voiceOf.get(index)?.duration ?? null),
		durations,
		pause: voice?.voiceSettings.pause ?? 0,
	});

	// 빈 타임라인에 첫 영상을 넣으면 InsertElementCommand가 화면 크기를 그 영상에 맞춘다.
	// 자막 위치는 화면 크기로 계산하니, 자막을 만들기 전에 같은 크기로 먼저 맞춰 둔다
	const first = clips[plan.beats[0].clip];
	if (first.width && first.height) {
		editor.project.updateSettings({
			settings: { canvasSize: { width: first.width, height: first.height } },
			pushHistory: false,
		});
	}

	const look = ADJUST_PRESETS.find((preset) => preset.id === plan.look);
	const videoTrack = new AddTrackCommand({ type: "video" });
	const audioTrack = new AddTrackCommand({ type: "audio" });
	const commands: Command[] = [
		new DeleteElementsCommand({
			elements: editor.scenes
				.getActiveScene()
				.tracks.flatMap((track) =>
					track.elements.map((element) => ({ trackId: track.id, elementId: element.id })),
				),
		}),
		videoTrack,
	];

	for (const [index, beat] of plan.beats.entries()) {
		const asset = clips[beat.clip];
		const { at, length } = placed[index];
		const source = mediaTimeFromSeconds({ seconds: asset.duration ?? 0 });
		const trimStart = mediaTimeFromSeconds({ seconds: beat.start });
		const duration = mediaTimeFromSeconds({ seconds: length });
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime: mediaTimeFromSeconds({ seconds: at }),
		});
		if (element.type !== "video") continue;
		commands.push(
			new InsertElementCommand({
				placement: { mode: "explicit", trackId: videoTrack.getTrackId() },
				element: {
					...element,
					trimStart,
					trimEnd: subMediaTime({ a: subMediaTime({ a: source, b: trimStart }), b: duration }),
					sourceDuration: source,
					params: voiceOf.has(index)
						? { ...element.params, volume: SOURCE_VOLUME_UNDER_VOICE_DB }
						: element.params,
					...(look
						? {
								effects: [
									buildDefaultEffectInstance({
										effectType: ADJUST_EFFECT_TYPE,
										params: look.params,
									}),
								],
							}
						: {}),
					...(beat.transition
						? { transition: { type: beat.transition, duration: TRANSITION_SECONDS } }
						: {}),
				},
			}),
		);
	}

	if (voice && voiceAssets.length > 0) {
		commands.push(audioTrack);
		for (const { index, text } of spoken) {
			const asset = voiceOf.get(index);
			const voiceAt = placed[index].voiceAt;
			if (!asset || voiceAt === null) continue;
			const element = buildElementFromMedia({
				mediaId: asset.id,
				mediaType: asset.type,
				name: asset.name,
				duration: mediaTimeFromSeconds({ seconds: asset.duration ?? 0 }),
				startTime: mediaTimeFromSeconds({ seconds: voiceAt }),
			});
			const tts: AudioElement["tts"] = {
				text,
				voice: voice.voiceSettings.voice,
				style: voice.voiceSettings.style,
				speed: voice.voiceSettings.speed,
				strength: voice.voiceSettings.strength,
				expressiveness: voice.voiceSettings.expressiveness,
				model: voice.model,
				lineId: generateUUID(),
			};
			commands.push(
				new InsertElementCommand({
					placement: { mode: "explicit", trackId: audioTrack.getTrackId() },
					element: element.type === "audio" ? { ...element, tts } : element,
				}),
			);
		}
	}

	// 자막은 내레이션의 받아쓰기가 아니라 따로 쓴 짧은 문장이라 ttsLineId로 묶지 않는다(묶으면 "음성이 낡았다"로 뜬다)
	// 음성이 다음 컷으로 넘어가면 자막도 넘어간다. 한 트랙에서 겹치지 않게 뒤 자막의 시작을 민다
	let captionEnd = 0;
	const captions = plan.beats.flatMap((beat, index) => {
		if (!beat.caption) return [];
		const { at, length, voiceAt } = placed[index];
		const voiceLength = voiceOf.get(index)?.duration;
		const from = voiceAt !== null && voiceLength ? voiceAt : at;
		const startTime = Math.max(from, captionEnd);
		const duration = from + (voiceAt !== null && voiceLength ? voiceLength : length) - startTime;
		if (duration < MIN_CAPTION_SECONDS) return [];
		captionEnd = startTime + duration;
		return [{ text: beat.caption, startTime, duration }];
	});
	if (captions.length > 0) {
		commands.push(...buildCaptionTrackCommands({ editor, captions }).commands);
	}

	editor.command.execute({ command: new BatchCommand(commands) });
}
