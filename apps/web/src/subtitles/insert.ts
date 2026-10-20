import type { EditorCore } from "@/core";
import {
	AddTrackCommand,
	BatchCommand,
	InsertElementCommand,
} from "@/commands";
import { buildSubtitleTextElement } from "./build-subtitle-text-element";
import type { SubtitleCue } from "./types";
import { generateUUID } from "@/utils/id";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeToSeconds } from "@/wasm";

export function insertCaptionChunksAsTextTrack({
	editor,
	captions,
}: {
	editor: EditorCore;
	captions: SubtitleCue[];
}): string | null {
	if (captions.length === 0) {
		return null;
	}

	const addTrackCommand = new AddTrackCommand({ type: "text", index: 0 });
	const trackId = addTrackCommand.getTrackId();
	const canvasSize = editor.project.getActive().settings.canvasSize;
	const subtitleGroupId = generateUUID();
	const insertCommands = captions.map(
		(caption, index) =>
			new InsertElementCommand({
				placement: { mode: "explicit", trackId },
				element: {
					...buildSubtitleTextElement({ index, caption, canvasSize }),
					subtitleGroupId,
					subtitleWordOffsets: caption.wordStarts?.map(
						(start) => start - caption.startTime,
					),
				},
			}),
	);
	editor.command.execute({
		command: new BatchCommand([addTrackCommand, ...insertCommands]),
	});

	return trackId;
}

/**
 * 자막 트랙의 빈 곳(startTime, 초)에 자막 하나를 넣는다. 마지막에 쓴 자막 스타일을 따르고,
 * 길이는 기본 길이와 다음 클립까지 남은 틈 중 짧은 쪽이다. 트랙에 자막 묶음이 있으면 그 묶음에 넣는다
 */
export function insertCaptionAt({
	editor,
	trackId,
	startTime,
	text,
}: {
	editor: EditorCore;
	trackId: string;
	startTime: number;
	text: string;
}): void {
	const track = editor.timeline.getTrackById({ trackId });
	if (track?.type !== "text" || !text.trim()) return;

	const nextStart = Math.min(
		...track.elements
			.map((element) => mediaTimeToSeconds({ time: element.startTime }))
			.filter((start) => start > startTime),
	);
	const duration = Math.min(
		mediaTimeToSeconds({ time: DEFAULT_NEW_ELEMENT_DURATION }),
		nextStart - startTime,
	);
	const subtitleGroupId =
		track.elements.find((element) => element.subtitleGroupId)
			?.subtitleGroupId ?? generateUUID();

	editor.command.execute({
		command: new InsertElementCommand({
			placement: { mode: "explicit", trackId },
			element: {
				...buildSubtitleTextElement({
					index: track.elements.length,
					caption: { text: text.trim(), startTime, duration },
					canvasSize: editor.project.getActive().settings.canvasSize,
				}),
				subtitleGroupId,
			},
		}),
	});
}
