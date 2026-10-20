import { DEFAULT_RETIME_RATE, getClipTimeAtSourceTime, getSourceTimeAtClipTime } from "@/retime";
import { isRetimableElement } from "@/timeline/element-utils";
import { splitElementAtTime } from "@/timeline/split-element";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline/types";
import type { TimeRange } from "@/transcription/speech-regions";
import type { FrameRate } from "opencut-wasm";
import {
	addMediaTime,
	type MediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	roundFrameTime,
	roundMediaTime,
	subMediaTime,
} from "@/wasm";

export interface TimelineRange {
	start: MediaTime;
	end: MediaTime;
}

export interface TimelineEdit extends TimelineRange {
	/** 있으면 지우지 않고 이 배속으로 빠르게 넘긴다 */
	rate?: number;
}

const seconds = (time: MediaTime) => mediaTimeToSeconds({ time });

/** 소스 시간(초)으로 된 컷을 클립이 놓인 타임라인 구간으로 바꾼다. 클립 밖은 버리고 프레임에 맞춘다. 컷의 다른 필드는 그대로 둔다 */
export function sourceCutsToTimeline<TCut extends { start: number; end: number }>({
	element,
	cuts,
	fps,
}: {
	element: TimelineElement;
	cuts: readonly TCut[];
	fps: FrameRate;
}): (Omit<TCut, "start" | "end"> & TimelineRange)[] {
	const retime = isRetimableElement(element) ? element.retime : undefined;
	const trimStart = seconds(element.trimStart);
	const clipStart = seconds(element.startTime);
	const clipEnd = clipStart + seconds(element.duration);
	const toTimeline = (sourceSeconds: number) =>
		roundFrameTime({
			time: mediaTimeFromSeconds({
				seconds: Math.min(
					clipEnd,
					Math.max(
						clipStart,
						clipStart + getClipTimeAtSourceTime({ sourceTime: sourceSeconds - trimStart, retime }),
					),
				),
			}),
			fps,
		});

	return cuts
		.map((cut) => ({ ...cut, start: toTimeline(cut.start), end: toTimeline(cut.end) }))
		.filter((range) => range.end > range.start);
}

/**
 * 클립 위에 놓인 자막의 단어 시각을 클립의 소스 시간(초)으로 모은다. VAD가 놓친 말도 자막이 있으면 자르지 않는다.
 * 단어 끝은 다음 단어 시작이나 자막 끝이다
 */
/** 타임라인 시각(초)을 클립 원본 시각(초)으로. 배속이 걸린 클립도 맞춘다 */
export function timelineToSource({
	element,
	timelineSeconds,
}: {
	element: TimelineElement;
	timelineSeconds: number;
}): number {
	const retime = isRetimableElement(element) ? element.retime : undefined;
	return (
		seconds(element.trimStart) +
		getSourceTimeAtClipTime({ clipTime: timelineSeconds - seconds(element.startTime), retime })
	);
}

export function collectSubtitleWords({
	tracks,
	element,
}: {
	tracks: SceneTracks;
	element: TimelineElement;
}): TimeRange[] {
	const clipStart = seconds(element.startTime);
	const clipEnd = clipStart + seconds(element.duration);
	const toSource = (timelineSeconds: number) => timelineToSource({ element, timelineSeconds });

	const words: TimeRange[] = [];
	for (const track of tracks) {
		for (const text of track.elements) {
			if (text.type !== "text" || !text.subtitleWordOffsets?.length) continue;
			const origin = seconds(text.startTime) - seconds(text.trimStart);
			const textEnd = seconds(text.startTime) + seconds(text.duration);
			const starts = text.subtitleWordOffsets.map((offset) => origin + offset);
			starts.forEach((start, index) => {
				const end = Math.min(textEnd, starts[index + 1] ?? textEnd);
				if (end <= start || end <= clipStart || start >= clipEnd) return;
				words.push({
					start: toSource(Math.max(start, clipStart)),
					end: toSource(Math.min(end, clipEnd)),
				});
			});
		}
	}
	return words;
}

/**
 * 고른 트랙들에서 구간을 지우거나 배속으로 줄이고 뒤 요소를 당긴다(리플).
 * 구간에 걸친 요소는 나눠서 걸친 부분만 바꾼다. 고르지 않은 트랙(배경음악 등)은 그대로 둔다
 */
export function applyTimelineEdits({
	tracks,
	edits,
	shouldEdit,
	crossfadeSeconds,
	maintainPitch,
	fps,
}: {
	tracks: SceneTracks;
	edits: readonly TimelineEdit[];
	shouldEdit: (track: TimelineTrack) => boolean;
	crossfadeSeconds: number;
	maintainPitch: boolean;
	fps: FrameRate;
}): SceneTracks {
	// 뒤 구간부터 바꿔야 앞 구간의 위치가 바뀌지 않는다
	const sorted = [...edits].sort((a, b) => b.start - a.start);
	return tracks.map((track) =>
		shouldEdit(track)
			? editTrack({ track, edits: sorted, crossfadeSeconds, maintainPitch, fps })
			: track,
	);
}

function editTrack<TTrack extends TimelineTrack>({
	track,
	edits,
	crossfadeSeconds,
	maintainPitch,
	fps,
}: {
	track: TTrack;
	edits: readonly TimelineEdit[];
	crossfadeSeconds: number;
	maintainPitch: boolean;
	fps: FrameRate;
}): TTrack {
	let elements: TimelineElement[] = track.elements;
	for (const edit of edits) {
		const newLength = edit.rate ? speedLength({ range: edit, rate: edit.rate, fps }) : null;
		elements = elements.flatMap((element) =>
			newLength === null
				? removeRange({ element, range: edit, crossfadeSeconds })
				: speedRange({ element, range: edit, newLength, maintainPitch }),
		);
	}
	return { ...track, elements } as TTrack;
}

/** 배속을 건 구간의 새 길이. 뒤 요소가 프레임에서 벗어나지 않게 프레임에 맞춘다 */
function speedLength({ range, rate, fps }: { range: TimelineRange; rate: number; fps: FrameRate }): MediaTime {
	const length = subMediaTime({ a: range.end, b: range.start });
	const rounded = roundFrameTime({ time: roundMediaTime({ time: length / rate }), fps });
	return rounded > 0 ? rounded : length;
}

/**
 * 구간을 `newLength`로 줄인다. 영상·오디오는 구간 경계에서 나눠 가운데 조각에 배속을 걸고,
 * 원본이 없는 요소(자막·스티커 등)는 시작과 끝 시각만 줄어든 구간에 맞춰 옮긴다
 */
function speedRange({
	element,
	range,
	newLength,
	maintainPitch,
}: {
	element: TimelineElement;
	range: TimelineRange;
	newLength: MediaTime;
	maintainPitch: boolean;
}): TimelineElement[] {
	const length = subMediaTime({ a: range.end, b: range.start });
	const removed = subMediaTime({ a: length, b: newLength });
	const elementEnd = addMediaTime({ a: element.startTime, b: element.duration });
	if (elementEnd <= range.start) return [element];
	if (element.startTime >= range.end) {
		return [{ ...element, startTime: subMediaTime({ a: element.startTime, b: removed }) }];
	}
	const move = (time: MediaTime): MediaTime => {
		if (time <= range.start) return time;
		if (time >= range.end) return subMediaTime({ a: time, b: removed });
		return addMediaTime({
			a: range.start,
			b: roundMediaTime({ time: ((time - range.start) * newLength) / length }),
		});
	};

	if (!isRetimableElement(element)) {
		// ponytail: 구간 안에 걸린 자막 단어·키프레임 시각은 비례로 옮기지 않는다. 말 없는 구간에만 배속을 거니 드물다
		const start = move(element.startTime);
		return [{ ...element, startTime: start, duration: subMediaTime({ a: move(elementEnd), b: start }) }];
	}

	// 나눈 왼쪽 조각이 원래 id를 지키므로 맨 앞 조각이 선택을 이어받는다
	const pieces: TimelineElement[] = [];
	let middle: TimelineElement = element;
	let tail: TimelineElement | null = null;
	if (element.startTime < range.start) {
		const halves = splitElementAtTime({ element: middle, splitTime: range.start });
		if (halves) {
			pieces.push({ ...halves.left, name: element.name });
			middle = halves.right;
		}
	}
	if (elementEnd > range.end) {
		const halves = splitElementAtTime({ element: middle, splitTime: range.end });
		if (halves) {
			middle = halves.left;
			tail = halves.right;
		}
	}
	if (isRetimableElement(middle)) {
		const start = move(middle.startTime);
		const duration = subMediaTime({
			a: move(addMediaTime({ a: middle.startTime, b: middle.duration })),
			b: start,
		});
		const rate = ((middle.retime?.rate ?? DEFAULT_RETIME_RATE) * middle.duration) / duration;
		pieces.push({ ...middle, name: element.name, startTime: start, duration, retime: { rate, maintainPitch } });
	}
	if (tail) {
		pieces.push({ ...tail, name: element.name, startTime: subMediaTime({ a: tail.startTime, b: removed }) });
	}
	return pieces;
}

const SOURCELESS_TYPES = new Set<TimelineElement["type"]>(["text", "sticker", "graphic", "effect"]);

function hasAnimations(element: TimelineElement): boolean {
	return Object.keys(element.animations ?? {}).length > 0;
}

function removeRange({
	element,
	range,
	crossfadeSeconds,
}: {
	element: TimelineElement;
	range: TimelineRange;
	crossfadeSeconds: number;
}): TimelineElement[] {
	const length = subMediaTime({ a: range.end, b: range.start });
	const elementEnd = element.startTime + element.duration;
	if (elementEnd <= range.start) return [element];
	if (element.startTime >= range.end) {
		return [{ ...element, startTime: subMediaTime({ a: element.startTime, b: length }) }];
	}
	// 키프레임이 있으면 나눠야 뒤쪽 키프레임 시각이 맞는다
	if (SOURCELESS_TYPES.has(element.type) && !hasAnimations(element)) {
		return shrinkElement({ element, range });
	}

	const kept: TimelineElement[] = [];
	let rest: TimelineElement | null = element;
	if (element.startTime < range.start) {
		const halves = splitElementAtTime({ element, splitTime: range.start });
		if (halves) {
			kept.push({ ...halves.left, name: element.name });
			rest = halves.right;
		}
	}
	if (rest && elementEnd > range.end) {
		const halves = splitElementAtTime({ element: rest, splitTime: range.end });
		if (halves) {
			// 남는 첫 조각이 원래 id를 이어받아 선택이 유지된다
			kept.push({
				...halves.right,
				id: kept.length === 0 ? element.id : halves.right.id,
				name: element.name,
				startTime: range.start,
			});
		}
	}
	// 같은 클립의 두 조각이 맞붙으면 잘라 낸 부분을 핸들로 짧게 겹쳐 딸깍 소리를 없앤다
	if (
		kept.length === 2 &&
		crossfadeSeconds > 0 &&
		(element.type === "video" || element.type === "audio")
	) {
		kept[0] = { ...kept[0], params: { ...kept[0].params, crossfade: crossfadeSeconds } };
	}
	return kept;
}

/**
 * 원본이 없는 요소(자막·스티커·도형·효과)는 나누지 않고 구간만큼 줄인다. 나누면 같은 글이 두 개가 된다.
 * 자막 단어 시각은 잘린 단어를 빼고 뒤를 당긴다
 */
function shrinkElement({
	element,
	range,
}: {
	element: TimelineElement;
	range: TimelineRange;
}): TimelineElement[] {
	const length = subMediaTime({ a: range.end, b: range.start });
	const elementEnd = addMediaTime({ a: element.startTime, b: element.duration });
	const startsBefore = element.startTime < range.start;
	const start = startsBefore ? element.startTime : range.start;
	const end = elementEnd > range.end ? subMediaTime({ a: elementEnd, b: length }) : range.start;
	if (end <= start) return [];
	// 앞이 잘리면 trimStart를 그만큼 늘려 단어 시각의 기준(startTime - trimStart)이 잘린 길이만큼 앞으로 간다
	const trimStart = startsBefore
		? element.trimStart
		: addMediaTime({
				a: element.trimStart,
				b: subMediaTime({ a: range.end, b: element.startTime }),
			});
	const shrunk = { ...element, startTime: start, duration: subMediaTime({ a: end, b: start }), trimStart };
	if (shrunk.type !== "text" || !shrunk.subtitleWordOffsets) return [shrunk];

	const origin = seconds(element.startTime) - seconds(element.trimStart);
	const newOrigin = seconds(start) - seconds(trimStart);
	const cutStart = seconds(range.start);
	const cutLength = seconds(length);
	const subtitleWordOffsets = shrunk.subtitleWordOffsets.flatMap((offset) => {
		const at = origin + offset;
		if (at >= cutStart && at < cutStart + cutLength) return [];
		return [(at < cutStart ? at : at - cutLength) - newOrigin];
	});
	return [{ ...shrunk, subtitleWordOffsets }];
}
