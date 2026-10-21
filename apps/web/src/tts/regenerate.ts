import type { EditorCore } from "@/core";
import { BatchCommand, DeleteElementsCommand, UpdateElementsCommand } from "@/commands";
import { getTimelineDurationForSourceSpan } from "@/retime";
import { buildCaptionTrackCommands } from "@/subtitles/insert";
import { toElementDurationTicks } from "@/timeline/creation";
import type { AudioElement, ElementRef } from "@/timeline";
import type { CaptionLayout } from "@/transcription/types";
import { addMediaTime, roundMediaTime, ZERO_MEDIA_TIME } from "@/wasm";
import { buildClipCaptions, synthesizeAssets, type TtsVoiceSettings } from "./insert";
import { findLineCaptions, rippleLineUpdates } from "./lines";

/** 뒤 클립을 스스로 민다. 리플 편집 모드가 한 번 더 당기지 않는다 */
class RegenerateLineCommand extends BatchCommand {
	readonly ripplesItself = true;
}

/**
 * 문장 하나를 다시 합성해 음성 클립을 바꾼다. 자리·볼륨·페이드 같은 클립 값은 그대로 두고 미디어와 길이만 바꾼다.
 * 그 문장 자막은 지우고 새 길이로 다시 만든다(같은 트랙·같은 묶음·첫 자막의 스타일).
 * 길이가 바뀐 만큼 음성 트랙과 자막 트랙에서 옛 음성 끝 이후에 시작하는 클립을 민다.
 * 모두 BatchCommand 하나라 ⌘Z 한 번에 예전 음성·자막·위치로 돌아간다. 같은 글자로 다시 만들면 다른 테이크가 나온다.
 * 돌려주는 값은 새 첫 자막(자막이 없으면 null)
 */
export async function regenerateLine({
	editor,
	elementId,
	text,
	voiceSettings,
	model,
	captionLayout,
	signal,
}: {
	editor: EditorCore;
	/** 다시 만들 음성 클립 */
	elementId: string;
	text: string;
	voiceSettings: TtsVoiceSettings;
	model: string;
	captionLayout: CaptionLayout;
	signal: AbortSignal;
}): Promise<{ caption: ElementRef | null }> {
	const [asset] = await synthesizeAssets({
		editor,
		sentences: [text],
		voiceSettings,
		signal,
		// 한 문장이라 진행률은 보여 주지 않는다
		onProgress: () => {},
	});

	// 합성하는 동안 클립을 옮겼을 수 있어 끝난 뒤의 타임라인으로 계산한다
	const tracks = editor.scenes.getActiveScene().tracks;
	const audioTrack = tracks.find(
		(track) =>
			track.type === "audio" && track.elements.some((item) => item.id === elementId),
	);
	const element = audioTrack?.elements.find((item) => item.id === elementId);
	if (!audioTrack || element?.type !== "audio" || element.sourceType !== "upload" || !element.tts) {
		throw new Error(asset.name);
	}

	const sourceDuration = toElementDurationTicks({ seconds: asset.duration });
	// 속도를 바꾼 클립은 새 음성도 같은 속도로 재생되게 길이를 맞춘다
	const duration = element.retime
		? roundMediaTime({
				time: getTimelineDurationForSourceSpan({
					sourceSpan: sourceDuration,
					retime: element.retime,
				}),
			})
		: sourceDuration;
	const tts: AudioElement["tts"] = {
		...element.tts,
		text,
		voice: voiceSettings.voice,
		style: voiceSettings.style,
		speed: voiceSettings.speed,
		strength: voiceSettings.strength,
		expressiveness: voiceSettings.expressiveness,
		model,
	};

	const oldCaptions = findLineCaptions({ tracks, lineId: element.tts.lineId });
	const first = oldCaptions[0];
	const captionTrackId = first?.trackId ?? null;
	const captionInsert = first
		? buildCaptionTrackCommands({
				editor,
				captions: buildClipCaptions({
					text,
					clip: { startTime: element.startTime, duration },
					layout: captionLayout,
					lineId: element.tts.lineId,
				}),
				trackId: first.trackId,
				subtitleGroupId: first.element.subtitleGroupId,
				params: first.element.params,
			}).commands
		: [];

	const ripple = rippleLineUpdates({
		tracks,
		trackIds: captionTrackId ? [audioTrack.id, captionTrackId] : [audioTrack.id],
		afterTime: addMediaTime({ a: element.startTime, b: element.duration }),
		delta: duration - element.duration,
	});

	editor.command.execute({
		command: new RegenerateLineCommand([
			...(oldCaptions.length > 0
				? [
						new DeleteElementsCommand({
							elements: oldCaptions.map((caption) => ({
								trackId: caption.trackId,
								elementId: caption.element.id,
							})),
						}),
					]
				: []),
			new UpdateElementsCommand({
				updates: [
					{
						trackId: audioTrack.id,
						elementId,
						patch: {
							mediaId: asset.id,
							duration,
							sourceDuration,
							trimStart: ZERO_MEDIA_TIME,
							trimEnd: ZERO_MEDIA_TIME,
							tts,
						},
					},
					...ripple,
				],
			}),
			...captionInsert,
		]),
	});

	const [newFirst] = findLineCaptions({
		tracks: editor.scenes.getActiveScene().tracks,
		lineId: element.tts.lineId,
	});
	return {
		caption: newFirst ? { trackId: newFirst.trackId, elementId: newFirst.element.id } : null,
	};
}
