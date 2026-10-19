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
import {
	clampCueTiming,
	mergeCues,
	planReplaceAll,
	splitCue,
	type Cue,
} from "./edit";

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
	return {
		startTime,
		duration: subMediaTime({ a: toTime(end), b: startTime }),
	};
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
	const merged = mergeCues({
		first: cueOf({ entry: first }),
		second: cueOf({ entry: second }),
	});
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
	if (!timing || (timing.start === current.start && timing.end === current.end))
		return false;
	editor.timeline.updateElements({
		updates: [
			{
				trackId: entry.trackId,
				elementId: entry.element.id,
				patch: timingPatch(timing),
			},
		],
	});
	return true;
}

/** 그룹 안의 검색어를 모두 바꾼다. 한 번의 실행 취소로 되돌아간다 */
export function replaceAllInSubtitles({
	editor,
	entries,
	query,
	replacement,
}: {
	editor: EditorCore;
	entries: SubtitleEntry[];
	query: string;
	replacement: string;
}): number {
	const plan = planReplaceAll({
		cues: entries.map((entry) => ({
			id: entry.element.id,
			text: cueOf({ entry }).text,
		})),
		query,
		replacement,
	});
	const textById = new Map(plan.map(({ id, text }) => [id, text]));
	editor.timeline.updateElements({
		updates: entries.flatMap((entry) => {
			const text = textById.get(entry.element.id);
			return text === undefined
				? []
				: [
						{
							trackId: entry.trackId,
							elementId: entry.element.id,
							patch: { params: { content: text } },
						},
					];
		}),
	});
	return plan.length;
}

/** 이 자막에서 검색어가 처음 나오는 곳 하나만 바꾼다 */
export function replaceInSubtitle({
	editor,
	entry,
	query,
	replacement,
}: {
	editor: EditorCore;
	entry: SubtitleEntry;
	query: string;
	replacement: string;
}): void {
	const text = cueOf({ entry }).text;
	if (!query || !text.includes(query)) return;
	editor.timeline.updateElements({
		updates: [
			{
				trackId: entry.trackId,
				elementId: entry.element.id,
				patch: { params: { content: text.replace(query, () => replacement) } },
			},
		],
	});
}
