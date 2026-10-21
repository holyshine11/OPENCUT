import type { EditorCore } from "@/core";
import {
	AddTrackCommand,
	BatchCommand,
	type Command,
	InsertElementCommand,
} from "@/commands";
import type { TextElement } from "@/timeline";
import type { ParamValues } from "@/params";
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

	const { trackId, commands } = buildCaptionTrackCommands({ editor, captions });
	editor.command.execute({ command: new BatchCommand(commands) });

	return trackId;
}

/**
 * 자막 트랙 하나를 맨 위에 만들고 자막을 넣는 명령들. 실행은 부르는 쪽이 한다.
 * 대본 읽기는 음성 트랙과 함께 BatchCommand 하나로 묶어 ⌘Z 한 번에 지운다.
 * trackId를 주면 그 트랙에 넣고 트랙의 자막 묶음(insertCaptionAt처럼)이나 subtitleGroupId 묶음에 넣는다.
 * params를 주면 글자(content)만 빼고 그 스타일을 덮어쓴다. 다시 만든 자막이 사용자가 고친 모양을 잇는다
 */
export function buildCaptionTrackCommands({
	editor,
	captions,
	trackId: existingTrackId,
	subtitleGroupId: existingGroupId,
	params,
}: {
	editor: EditorCore;
	captions: (SubtitleCue & Pick<TextElement, "ttsLineId">)[];
	trackId?: string;
	subtitleGroupId?: string;
	params?: ParamValues;
}): { trackId: string; commands: Command[] } {
	const existingTrack = existingTrackId
		? editor.timeline.getTrackById({ trackId: existingTrackId })
		: null;
	const textTrack = existingTrack?.type === "text" ? existingTrack : null;
	const addTrackCommand = new AddTrackCommand({ type: "text", index: 0 });
	const trackId = textTrack?.id ?? addTrackCommand.getTrackId();
	const existingElements = textTrack?.elements ?? [];
	const canvasSize = editor.project.getActive().settings.canvasSize;
	const subtitleGroupId =
		existingGroupId ??
		existingElements.find((element) => element.subtitleGroupId)?.subtitleGroupId ??
		generateUUID();
	const { content: _content, ...style } = params ?? {};
	const insertCommands = captions.map((caption, index) => {
		const element = buildSubtitleTextElement({
			index: existingElements.length + index,
			caption,
			canvasSize,
		});
		return new InsertElementCommand({
			placement: { mode: "explicit", trackId },
			element: {
				...element,
				params: { ...element.params, ...style },
				subtitleGroupId,
				subtitleWordOffsets: caption.wordStarts?.map(
					(start) => start - caption.startTime,
				),
				...(caption.ttsLineId ? { ttsLineId: caption.ttsLineId } : {}),
			},
		});
	});

	return {
		trackId,
		commands: textTrack ? insertCommands : [addTrackCommand, ...insertCommands],
	};
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
