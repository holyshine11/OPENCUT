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
import { buildDefaultMaskInstance } from "@/masks";
import type { Mask } from "@/masks/types";
import { decodeAudioToFloat32 } from "@/media/audio";
import type { MediaAsset } from "@/media/types";
import { importSoundAsMedia, type SoundItem } from "@/sounds/sound-library";
import { buildCaptionTrackCommands } from "@/subtitles/insert";
import type { AudioElement } from "@/timeline";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { synthesizeAssets, type TtsVoiceSettings } from "@/tts/insert";
import { generateUUID } from "@/utils/id";
import { mediaTimeFromSeconds, subMediaTime } from "@/wasm";
import {
	activeLoudness,
	type BeatTiming,
	type Box,
	coverScale,
	type EditFormat,
	type EditPlan,
	FORMATS,
	MIX,
	placeBeats,
	sfxVolume,
} from "./plan";

const TRANSITION_SECONDS = 0.3;
const MIN_CAPTION_SECONDS = 0.3;
// 강조 컷(impact: "zoom")은 화면을 이만큼 당겨 잡는다
const ZOOM_SCALE = 1.2;
const SFX_FADE_OUT_SECONDS = 0.15;
// 얼굴을 알아볼 수 없게 마스크 강도 범위(1~100)의 최대로 건다
const MOSAIC_STRENGTH = 100;

export interface EditVoice {
	voiceSettings: TtsVoiceSettings;
	model: string;
}

/** 프레임 비율로 받은 영역을 클립에 붙는 모자이크 마스크로 바꾼다. 마스크는 클립 가운데가 (0,0)이다 */
function mosaicMask(box: Box): Mask {
	const mask = buildDefaultMaskInstance({ maskType: "rectangle" });
	if (mask.type !== "rectangle") return mask;
	return {
		...mask,
		fill: "mosaic",
		params: {
			...mask.params,
			fillStrength: MOSAIC_STRENGTH,
			centerX: box.x + box.w / 2 - 0.5,
			centerY: box.y + box.h / 2 - 0.5,
			width: box.w,
			height: box.h,
		},
	};
}

type Tts = NonNullable<AudioElement["tts"]>;
const ttsKey = ({ lineId: _lineId, ...tts }: Tts) => JSON.stringify(tts);

/**
 * 계획대로 타임라인을 새로 짠다. 있던 클립은 지우고 영상·내레이션·자막 트랙을 넣는데,
 * 전부 BatchCommand 하나라서 ⌘Z 한 번이면 AI 편집 전으로 돌아간다(합성한 음성 파일만 미디어 패널에 남는다).
 * voices가 null이면 내레이션 없이 자막만 넣는다.
 * 타임라인에 같은 문장·같은 목소리 설정으로 만든 음성이 이미 있으면 다시 합성하지 않고 그 파일을 쓴다
 */
export async function applyPlan({
	editor,
	plan,
	clips,
	voices,
	format,
	sounds,
	signal,
	onProgress,
}: {
	editor: EditorCore;
	plan: EditPlan;
	/** 계획의 클립 번호 → 미디어 */
	clips: Record<string, MediaAsset>;
	voices: Record<"wife" | "husband", EditVoice> | null;
	format: EditFormat;
	/** 계획의 sfx 이름으로 찾을 효과음 */
	sounds: SoundItem[];
	signal: AbortSignal;
	onProgress: (progress: { current: number; total: number }) => void;
}): Promise<BeatTiming[]> {
	const spoken = plan.beats.flatMap((beat, index) => {
		const voice = voices?.[beat.voice];
		if (!voice || !beat.narration) return [];
		const tts: Tts = {
			text: beat.narration,
			voice: voice.voiceSettings.voice,
			style: voice.voiceSettings.style,
			speed: voice.voiceSettings.speed,
			strength: voice.voiceSettings.strength,
			expressiveness: voice.voiceSettings.expressiveness,
			model: voice.model,
			lineId: generateUUID(),
		};
		return [{ index, who: beat.voice, tts }];
	});

	// 지난 편집에서 만든 음성. 문장과 목소리 설정이 그대로인 컷은 이걸 다시 쓴다
	const made = new Map<string, MediaAsset>();
	for (const track of editor.scenes.getActiveScene().tracks) {
		for (const element of track.elements) {
			if (element.type !== "audio" || !element.tts || !("mediaId" in element)) continue;
			const asset = editor.media.getAssets().find((item) => item.id === element.mediaId);
			if (asset?.duration) made.set(ttsKey(element.tts), asset);
		}
	}
	const voiceOf = new Map<number, MediaAsset>();
	const missing = spoken.filter((line) => {
		const asset = made.get(ttsKey(line.tts));
		if (asset) voiceOf.set(line.index, asset);
		return !asset;
	});

	// 합성은 목소리별로 묶어서 한다(파일 번호가 목소리마다 이어진다)
	let done = 0;
	for (const who of ["wife", "husband"] as const) {
		const lines = missing.filter((line) => line.who === who);
		if (!voices || lines.length === 0) continue;
		const before = done;
		const assets = await synthesizeAssets({
			editor,
			sentences: lines.map((line) => line.tts.text),
			voiceSettings: voices[who].voiceSettings,
			signal,
			onProgress: ({ current }) => onProgress({ current: before + current, total: missing.length }),
		});
		for (const [order, line] of lines.entries()) voiceOf.set(line.index, assets[order]);
		done += lines.length;
	}

	// 효과음은 프로젝트 미디어로 들여오고, 파일마다 다른 녹음 크기를 재 둔다
	const sfxOf = new Map<string, { asset: MediaAsset; loudness: number | null }>();
	for (const name of new Set(plan.beats.flatMap((beat) => beat.sfx ?? []))) {
		const sound = sounds.find((item) => item.fileName === name);
		const asset = sound
			? await importSoundAsMedia({
					sound,
					projectId: editor.project.getActive().metadata.id,
					mediaAssets: editor.media.getAssets(),
					addMediaAsset: (args) => editor.media.addMediaAsset(args),
				}).catch(() => null)
			: null;
		if (!asset?.duration) continue;
		const loudness = await decodeAudioToFloat32({ audioBlob: asset.file })
			.then(({ samples }) => activeLoudness(samples))
			.catch(() => null);
		sfxOf.set(name, { asset, loudness });
	}
	signal.throwIfAborted();

	const durations = Object.fromEntries(
		Object.entries(clips).map(([id, asset]) => [id, asset.duration ?? 0]),
	);
	const placed = placeBeats({
		beats: plan.beats,
		voices: plan.beats.map((_, index) => voiceOf.get(index)?.duration ?? null),
		durations,
		pause: voices?.wife.voiceSettings.pause ?? 0,
	});

	// 자막 위치는 화면 크기로 계산하니, 자막을 만들기 전에 쇼츠·롱폼 크기로 먼저 맞춰 둔다
	const canvas = FORMATS[format];
	const setCanvas = () =>
		editor.project.updateSettings({ settings: { canvasSize: { ...canvas } }, pushHistory: false });
	setCanvas();

	const look = ADJUST_PRESETS.find((preset) => preset.id === plan.look);
	const videoTrack = new AddTrackCommand({ type: "video" });
	const audioTrack = new AddTrackCommand({ type: "audio" });
	const sfxTrack = new AddTrackCommand({ type: "audio" });
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
		// 촬영본 비율이 화면과 다르면 꽉 채우고, 강조 컷은 더 당겨 잡는다
		const scale =
			(asset.width && asset.height
				? coverScale({ source: { width: asset.width, height: asset.height }, canvas })
				: 1) * (beat.impact === "zoom" ? ZOOM_SCALE : 1);
		const effects = [
			...(look
				? [buildDefaultEffectInstance({ effectType: ADJUST_EFFECT_TYPE, params: look.params })]
				: []),
			...(beat.impact && beat.impact !== "zoom"
				? [buildDefaultEffectInstance({ effectType: beat.impact })]
				: []),
		];
		commands.push(
			new InsertElementCommand({
				placement: { mode: "explicit", trackId: videoTrack.getTrackId() },
				element: {
					...element,
					trimStart,
					trimEnd: subMediaTime({ a: subMediaTime({ a: source, b: trimStart }), b: duration }),
					sourceDuration: source,
					params: {
						...element.params,
						volume: voiceOf.has(index) ? MIX.sourceUnderVoice : MIX.source,
						fadeIn: MIX.fade,
						fadeOut: MIX.fade,
						...(scale !== 1 ? { "transform.scaleX": scale, "transform.scaleY": scale } : {}),
					},
					...(effects.length > 0 ? { effects } : {}),
					...(beat.mosaic.length > 0 ? { masks: beat.mosaic.map(mosaicMask) } : {}),
					...(beat.transition
						? { transition: { type: beat.transition, duration: TRANSITION_SECONDS } }
						: {}),
				},
			}),
		);
	}

	if (voices && voiceOf.size > 0) {
		commands.push(audioTrack);
		for (const { index, tts } of spoken) {
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
			commands.push(
				new InsertElementCommand({
					placement: { mode: "explicit", trackId: audioTrack.getTrackId() },
					element: element.type === "audio" ? { ...element, tts } : element,
				}),
			);
		}
	}

	// 효과음은 컷 시작에 맞춘다. 한 트랙이라 다음 효과음이 오면 거기서 끊는다
	const sfxCuts = plan.beats.flatMap((beat, index) => {
		const sfx = beat.sfx ? sfxOf.get(beat.sfx) : undefined;
		return sfx ? [{ ...sfx, at: placed[index].at, underVoice: voiceOf.has(index) }] : [];
	});
	if (sfxCuts.length > 0) commands.push(sfxTrack);
	for (const [order, { asset, loudness, at, underVoice }] of sfxCuts.entries()) {
		const full = asset.duration ?? 0;
		const length = Math.min(full, (sfxCuts[order + 1]?.at ?? Infinity) - at);
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration: mediaTimeFromSeconds({ seconds: length }),
			startTime: mediaTimeFromSeconds({ seconds: at }),
		});
		commands.push(
			new InsertElementCommand({
				placement: { mode: "explicit", trackId: sfxTrack.getTrackId() },
				element: {
					...element,
					sourceDuration: mediaTimeFromSeconds({ seconds: full }),
					trimEnd: mediaTimeFromSeconds({ seconds: full - length }),
					params: {
						...element.params,
						volume: sfxVolume({ loudness, underVoice }),
						fadeOut: Math.min(SFX_FADE_OUT_SECONDS, length / 2),
					},
				},
			}),
		);
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
	// 빈 타임라인에 첫 영상을 넣으면 InsertElementCommand가 화면 크기를 그 영상에 맞춘다. 고른 형식으로 되돌린다
	setCanvas();
	return placed.map(({ length }, index) => ({ length, voice: voiceOf.get(index)?.duration ?? null }));
}
