import type { EditorCore } from "@/core";
import { AddTrackCommand, BatchCommand, InsertElementCommand } from "@/commands";
import { processMediaAssets, type ProcessedMediaAsset } from "@/media/processing";
import { buildCaptionTrackCommands } from "@/subtitles/insert";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { toElementDurationTicks } from "@/timeline/creation";
import type { AudioElement } from "@/timeline";
import type { CaptionChunk, CaptionLayout } from "@/transcription/types";
import type { MediaAsset } from "@/media/types";
import { generateUUID } from "@/utils/id";
import {
	addMediaTime,
	type MediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	minMediaTime,
	subMediaTime,
} from "@/wasm";
import settings from "@/tts/settings.json";
import { synthesize, type TtsSynthRequest } from "./client";
import { buildLineCaptions, placeLines } from "./placement";
import { nextTtsFileNumber } from "./sentences";
import { fitTtsTargets, pickTtsTargets } from "./targets";

export type TtsVoiceSettings = Omit<TtsSynthRequest, "text">;

/**
 * 문장마다 순서대로 하나씩 합성한 뒤(합성 서버는 동시에 보내도 빨라지지 않는다) 재생헤드 위치부터
 * 음성과 자막을 BatchCommand 하나로 넣는다. ⌘Z 한 번에 둘 다 사라진다.
 * 넣을 트랙은 pickTtsTargets가 고르고, 거기서 기존 클립과 겹치면 그 종류만 새 트랙에 넣는다(돌려주는 값으로 알린다).
 * 미디어 파일은 효과음처럼 되돌리기 대상이 아니라 남는다. 취소하거나 실패하면 아무것도 넣지 않는다
 */
export async function generateScriptAudio({
	editor,
	sentences,
	voiceSettings,
	model,
	captionLayout,
	signal,
	onProgress,
}: {
	editor: EditorCore;
	sentences: string[];
	voiceSettings: TtsVoiceSettings;
	model: string;
	/** null이면 자막을 만들지 않는다 */
	captionLayout: CaptionLayout | null;
	signal: AbortSignal;
	onProgress: (progress: { current: number; total: number }) => void;
}): Promise<{ audioMoved: boolean; captionsMoved: boolean }> {
	const start = mediaTimeToSeconds({ time: editor.playback.getCurrentTime() });
	// 화면에 보여 준 넣을 곳은 누른 때의 선택으로 정한다
	const preferred = pickTtsTargets({
		tracks: editor.scenes.getActiveScene().tracks,
		selectedTrackIds: editor.selection.getSelectedTrackIds(),
		selectedElements: editor.selection.getSelectedElements(),
	});
	const assets = await synthesizeAssets({ editor, sentences, voiceSettings, signal, onProgress });

	const segments = placeLines({
		lines: assets.map((asset, index) => ({
			text: sentences[index],
			duration: asset.duration ?? 0,
		})),
		start,
		pause: voiceSettings.pause,
	});
	const lineIds = segments.map(() => generateUUID());
	const clips = segments.map((segment, index) => ({
		startTime: mediaTimeFromSeconds({ seconds: segment.start }),
		duration: toElementDurationTicks({ seconds: assets[index].duration }),
	}));
	const captions = captionLayout
		? clips.flatMap((clip, index) =>
				buildClipCaptions({
					text: sentences[index],
					clip,
					layout: captionLayout,
					lineId: lineIds[index],
				}),
			)
		: [];

	const targets = fitTtsTargets({
		tracks: editor.scenes.getActiveScene().tracks,
		targets: preferred,
		audioSpans: clips,
		captionSpans: captions.map((caption) => ({
			startTime: mediaTimeFromSeconds({ seconds: caption.startTime }),
			duration: mediaTimeFromSeconds({ seconds: caption.duration }),
		})),
	});

	const audioTrack = new AddTrackCommand({ type: "audio" });
	const audioTrackId = targets.audioTrackId ?? audioTrack.getTrackId();
	const audioCommands = assets.map((asset, index) => {
		const tts: AudioElement["tts"] = {
			text: sentences[index],
			voice: voiceSettings.voice,
			style: voiceSettings.style,
			speed: voiceSettings.speed,
			strength: voiceSettings.strength,
			expressiveness: voiceSettings.expressiveness,
			model,
			lineId: lineIds[index],
		};
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration: clips[index].duration,
			startTime: clips[index].startTime,
		});
		return new InsertElementCommand({
			placement: { mode: "explicit", trackId: audioTrackId },
			element: element.type === "audio" ? { ...element, tts } : element,
		});
	});

	const captionCommands =
		captions.length > 0
			? buildCaptionTrackCommands({
					editor,
					captions,
					trackId: targets.captionTrackId ?? undefined,
				}).commands
			: [];

	editor.command.execute({
		command: new BatchCommand([
			...(targets.audioTrackId ? [] : [audioTrack]),
			...audioCommands,
			...captionCommands,
		]),
	});
	return { audioMoved: targets.audioMoved, captionsMoved: targets.captionsMoved };
}

/**
 * 문장을 하나씩 합성해 미디어 패널에 넣는다. 다 만들기 전에 실패하거나 취소하면 아무것도 넣지 않는다
 */
export async function synthesizeAssets({
	editor,
	sentences,
	voiceSettings,
	signal,
	onProgress,
}: {
	editor: EditorCore;
	sentences: string[];
	voiceSettings: TtsVoiceSettings;
	signal: AbortSignal;
	onProgress: (progress: { current: number; total: number }) => void;
}): Promise<MediaAsset[]> {
	const project = editor.project.getActive();
	const processed: ProcessedMediaAsset[] = [];
	// 미디어 패널에서 문장을 구분할 수 있게 실행할 때마다 001부터 다시 매기지 않고 이어 매긴다
	const firstNumber = nextTtsFileNumber({
		names: editor.media.getAssets().map((asset) => asset.name),
		voice: voiceSettings.voice,
	});

	try {
		for (const [index, text] of sentences.entries()) {
			onProgress({ current: index + 1, total: sentences.length });
			const blob = await synthesize({ request: { ...voiceSettings, text }, signal });
			const number = String(firstNumber + index).padStart(settings.fileNumberDigits, "0");
			const file = new File(
				[blob],
				`tts-${voiceSettings.voice}-${number}.${settings.format}`,
				{ type: blob.type },
			);
			const [asset] = await processMediaAssets({ files: [file] });
			if (!asset?.duration) throw new Error(file.name);
			signal.throwIfAborted();
			processed.push(asset);
		}
	} catch (error) {
		for (const asset of processed) if (asset.url) URL.revokeObjectURL(asset.url);
		throw error;
	}

	const assets: MediaAsset[] = [];
	for (const asset of processed) {
		const added = await editor.media.addMediaAsset({
			projectId: project.metadata.id,
			asset,
		});
		if (!added) throw new Error(asset.name);
		assets.push(added);
	}
	return assets;
}

/** 음성 클립 하나에 붙일 자막. 시각은 틱에 맞추고 모두 클립 안에 든다 */
export function buildClipCaptions({
	text,
	clip,
	layout,
	lineId,
}: {
	text: string;
	clip: { startTime: MediaTime; duration: MediaTime };
	layout: CaptionLayout;
	lineId: string;
}): (CaptionChunk & { ttsLineId: string })[] {
	const start = mediaTimeToSeconds({ time: clip.startTime });
	const clipEnd = addMediaTime({ a: clip.startTime, b: clip.duration });
	return buildLineCaptions({
		segment: { text, start, end: start + mediaTimeToSeconds({ time: clip.duration }) },
		layout,
	}).map((caption) => ({ ...snapToClip({ caption, clipEnd }), ttsLineId: lineId }));
}

/**
 * 자막 시각을 틱에 맞추고 끝을 음성 클립 끝 틱 안으로 넣는다.
 * 초 단위 시작과 길이를 따로 반올림하면 자막이 음성보다 1틱 길어질 수 있다
 */
function snapToClip({
	caption,
	clipEnd,
}: {
	caption: CaptionChunk;
	clipEnd: MediaTime;
}): CaptionChunk {
	const start = mediaTimeFromSeconds({ seconds: caption.startTime });
	const end = minMediaTime({
		a: mediaTimeFromSeconds({ seconds: caption.startTime + caption.duration }),
		b: clipEnd,
	});
	return {
		...caption,
		startTime: mediaTimeToSeconds({ time: start }),
		duration: mediaTimeToSeconds({ time: subMediaTime({ a: end, b: start }) }),
	};
}
