import type { EditorCore } from "@/core";
import {
	BatchCommand,
	DeleteElementsCommand,
	InsertElementCommand,
	UpdateElementsCommand,
} from "@/commands";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	subMediaTime,
	type MediaTime,
} from "@/wasm";
import type { SubtitleEntry } from "./groups";
import { clampCueTiming, mergeCues, splitCue, type Cue } from "./edit";

const seconds = (time: MediaTime) => mediaTimeToSeconds({ time });
const toTime = (value: number) => mediaTimeFromSeconds({ seconds: value });

export function cueOf({ entry }: { entry: SubtitleEntry }): Cue {
	const { element } = entry;
	return {
		text: String(element.params.content ?? ""),
		start: seconds(element.startTime),
		end: seconds(element.startTime) + seconds(element.duration),
	};
}

function timingPatch({ start, end }: { start: number; end: number }) {
	const startTime = toTime(start);
	return { startTime, duration: subMediaTime({ a: toTime(end), b: startTime }) };
}

/** 자막을 커서 위치에서 둘로 나눈다. 뒤쪽은 같은 스타일의 새 텍스트 요소가 된다 */
export function splitSubtitle({
	editor,
	entry,
	text,
	at,
}: {
	editor: EditorCore;
	entry: SubtitleEntry;
	text: string;
	at: number;
}): boolean {
	const pieces = splitCue({ cue: { ...cueOf({ entry }), text }, at });
	if (!pieces) return false;
	const [first, second] = pieces;
	const { id: _id, ...element } = entry.element;

	editor.command.execute({
		command: new BatchCommand([
			new UpdateElementsCommand({
				updates: [
					{
						trackId: entry.trackId,
						elementId: entry.element.id,
						patch: { ...timingPatch(first), params: { content: first.text } },
					},
				],
			}),
			new InsertElementCommand({
				placement: { mode: "explicit", trackId: entry.trackId },
				element: {
					...element,
					...timingPatch(second),
					params: { ...element.params, content: second.text },
				},
			}),
		]),
	});
	return true;
}

/** 다음 자막을 이 자막에 합친다 */
export function mergeSubtitles({
	editor,
	first,
	second,
}: {
	editor: EditorCore;
	first: SubtitleEntry;
	second: SubtitleEntry;
}): void {
	const merged = mergeCues({ first: cueOf({ entry: first }), second: cueOf({ entry: second }) });
	editor.command.execute({
		command: new BatchCommand([
			new DeleteElementsCommand({
				elements: [{ trackId: second.trackId, elementId: second.element.id }],
			}),
			new UpdateElementsCommand({
				updates: [
					{
						trackId: first.trackId,
						elementId: first.element.id,
						patch: { ...timingPatch(merged), params: { content: merged.text } },
					},
				],
			}),
		]),
	});
}

/** 시작·끝 시간을 바꾼다. 같은 그룹의 이웃 자막과 겹치면 그 경계까지만 바꾼다 */
export function retimeSubtitle({
	editor,
	entry,
	start,
	end,
	previous,
	next,
}: {
	editor: EditorCore;
	entry: SubtitleEntry;
	start: number;
	end: number;
	previous: SubtitleEntry | undefined;
	next: SubtitleEntry | undefined;
}): boolean {
	const current = cueOf({ entry });
	const timing = clampCueTiming({
		start,
		end,
		previousEnd: previous ? cueOf({ entry: previous }).end : 0,
		nextStart: next ? cueOf({ entry: next }).start : null,
	});
	if (!timing || (timing.start === current.start && timing.end === current.end)) return false;
	editor.timeline.updateElements({
		updates: [{ trackId: entry.trackId, elementId: entry.element.id, patch: timingPatch(timing) }],
	});
	return true;
}
