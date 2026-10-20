import { getClipTimeAtSourceTime, getSourceTimeAtClipTime } from "@/retime";
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
	subMediaTime,
} from "@/wasm";

export interface TimelineRange {
	start: MediaTime;
	end: MediaTime;
}

const seconds = (time: MediaTime) => mediaTimeToSeconds({ time });

/** 클립 원본 시각(초)을 타임라인 시각으로. 클립 밖은 클립 끝에 붙이고 프레임에 맞춘다. 배속이 걸린 클립도 맞춘다 */
export function sourceToTimeline({
	element,
	sourceSeconds,
	fps,
}: {
	element: TimelineElement;
	sourceSeconds: number;
	fps: FrameRate;
}): MediaTime {
	const retime = isRetimableElement(element) ? element.retime : undefined;
	const clipStart = seconds(element.startTime);
	const clipEnd = clipStart + seconds(element.duration);
	const clipTime = getClipTimeAtSourceTime({ sourceTime: sourceSeconds - seconds(element.trimStart), retime });
	return roundFrameTime({
		time: mediaTimeFromSeconds({ seconds: Math.min(clipEnd, Math.max(clipStart, clipStart + clipTime)) }),
		fps,
	});
}

/** 소스 시간(초)으로 된 컷을 클립이 놓인 타임라인 구간으로 바꾼다. 클립 밖은 버린다. 컷의 다른 필드는 그대로 둔다 */
export function sourceCutsToTimeline<TCut extends { start: number; end: number }>({
	element,
	cuts,
	fps,
}: {
	element: TimelineElement;
	cuts: readonly TCut[];
	fps: FrameRate;
}): (Omit<TCut, "start" | "end"> & TimelineRange)[] {
	return cuts
		.map((cut) => ({
			...cut,
			start: sourceToTimeline({ element, sourceSeconds: cut.start, fps }),
			end: sourceToTimeline({ element, sourceSeconds: cut.end, fps }),
		}))
		.filter((range) => range.end > range.start);
}

/** 소스 시간(초)으로 된 지점을 클립 안쪽 타임라인 시각으로 바꾼다. 클립 경계와 밖은 버린다. 지점의 다른 필드는 그대로 둔다 */
export function sourcePointsToTimeline<TPoint extends { time: number }>({
	element,
	points,
	fps,
}: {
	element: TimelineElement;
	points: readonly TPoint[];
	fps: FrameRate;
}): (Omit<TPoint, "time"> & { time: MediaTime })[] {
	const elementEnd = addMediaTime({ a: element.startTime, b: element.duration });
	return points
		.map((point) => ({ ...point, time: sourceToTimeline({ element, sourceSeconds: point.time, fps }) }))
		.filter((point) => point.time > element.startTime && point.time < elementEnd);
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
 * 고른 트랙들에서 구간을 지우고 뒤 요소를 당긴다(리플).
 * 구간에 걸친 요소는 나눠서 걸친 부분만 지운다. 고르지 않은 트랙(배경음악 등)은 그대로 둔다
 */
export function applyTimelineEdits({
	tracks,
	edits,
	shouldEdit,
	crossfadeSeconds,
}: {
	tracks: SceneTracks;
	edits: readonly TimelineRange[];
	shouldEdit: (track: TimelineTrack) => boolean;
	crossfadeSeconds: number;
}): SceneTracks {
	// 뒤 구간부터 바꿔야 앞 구간의 위치가 바뀌지 않는다
	const sorted = [...edits].sort((a, b) => b.start - a.start);
	return tracks.map((track) => (shouldEdit(track) ? editTrack({ track, edits: sorted, crossfadeSeconds }) : track));
}

function editTrack<TTrack extends TimelineTrack>({
	track,
	edits,
	crossfadeSeconds,
}: {
	track: TTrack;
	edits: readonly TimelineRange[];
	crossfadeSeconds: number;
}): TTrack {
	let elements: TimelineElement[] = track.elements;
	for (const edit of edits) elements = elements.flatMap((element) => removeRange({ element, range: edit, crossfadeSeconds }));
	return { ...track, elements } as TTrack;
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
