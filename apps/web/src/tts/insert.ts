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

export type TtsVoiceSettings = Omit<TtsSynthRequest, "text">;

/**
 * 문장마다 순서대로 하나씩 합성한 뒤(합성 서버는 동시에 보내도 빨라지지 않는다) 재생헤드 위치부터
 * 음성 트랙과 자막 트랙을 BatchCommand 하나로 넣는다. ⌘Z 한 번에 둘 다 사라진다.
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
}): Promise<void> {
	const project = editor.project.getActive();
	const start = mediaTimeToSeconds({ time: editor.playback.getCurrentTime() });
	const processed: ProcessedMediaAsset[] = [];

	try {
		for (const [index, text] of sentences.entries()) {
			onProgress({ current: index + 1, total: sentences.length });
			const blob = await synthesize({ request: { ...voiceSettings, text }, signal });
			const number = String(index + 1).padStart(settings.fileNumberDigits, "0");
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

	const segments = placeLines({
		lines: assets.map((asset, index) => ({
			text: sentences[index],
			duration: asset.duration ?? 0,
		})),
		start,
		pause: voiceSettings.pause,
	});
	const lineIds = segments.map(() => generateUUID());
	const clips = segments.map((segment, index) => {
		const startTime = mediaTimeFromSeconds({ seconds: segment.start });
		const duration = toElementDurationTicks({ seconds: assets[index].duration });
		return { startTime, duration, end: addMediaTime({ a: startTime, b: duration }) };
	});

	const audioTrack = new AddTrackCommand({ type: "audio" });
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
			placement: { mode: "explicit", trackId: audioTrack.getTrackId() },
			element: element.type === "audio" ? { ...element, tts } : element,
		});
	});

	const captionCommands = captionLayout
		? buildCaptionTrackCommands({
				editor,
				captions: segments.flatMap((segment, index) =>
					buildLineCaptions({ segment, layout: captionLayout }).map((caption) => ({
						...snapToClip({ caption, clipEnd: clips[index].end }),
						ttsLineId: lineIds[index],
					})),
				),
			}).commands
		: [];

	editor.command.execute({
		command: new BatchCommand([audioTrack, ...audioCommands, ...captionCommands]),
	});
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
