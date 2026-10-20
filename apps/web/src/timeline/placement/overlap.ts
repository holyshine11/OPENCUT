import type { TimelineElement } from "@/timeline";
import { mediaTime } from "@/wasm";
import type { PlacementTimeSpan } from "./types";

interface TrackWithElements {
	elements: TimelineElement[];
	locked?: boolean;
}

function wouldElementOverlap({
	elements,
	startTime,
	endTime,
	excludeElementId,
}: {
	elements: TimelineElement[];
	startTime: number;
	endTime: number;
	excludeElementId?: string;
}): boolean {
	return elements.some((element) => {
		if (excludeElementId && element.id === excludeElementId) {
			return false;
		}

		const elementEnd = element.startTime + element.duration;
		return startTime < elementEnd && endTime > element.startTime;
	});
}

export function canPlaceTimeSpansOnTrack({
	track,
	timeSpans,
}: {
	track: TrackWithElements;
	timeSpans: PlacementTimeSpan[];
}): boolean {
	// 잠긴 트랙에는 붙여넣기·끌어 놓기·이동으로 클립을 넣지 않는다
	if (track.locked) return false;
	return timeSpans.every(({ startTime, duration, excludeElementId }) => {
		return !wouldElementOverlap({
			elements: track.elements,
			startTime,
			endTime: startTime + duration,
			excludeElementId,
		});
	});
}

/**
 * 복제본을 같은 트랙에서 원본 묶음 바로 뒤에 둘 때의 이동량(틱).
 * 바로 뒤가 막혀 있으면 그 뒤로 처음 들어갈 수 있는 빈자리로 민다
 */
export function findDuplicateOffset({
	trackElements,
	originals,
}: {
	trackElements: TimelineElement[];
	originals: TimelineElement[];
}): number {
	if (originals.length === 0) return 0;
	const groupStart = Math.min(...originals.map((e) => e.startTime));
	const groupEnd = Math.max(...originals.map((e) => e.startTime + e.duration));
	const candidateStarts = [
		groupEnd,
		...trackElements
			.map((e) => e.startTime + e.duration)
			.filter((end) => end > groupEnd)
			.sort((a, b) => a - b),
	];
	for (const start of candidateStarts) {
		const offset = start - groupStart;
		const fits = canPlaceTimeSpansOnTrack({
			track: { elements: trackElements },
			timeSpans: originals.map((e) => ({
				startTime: mediaTime({ ticks: e.startTime + offset }),
				duration: e.duration,
			})),
		});
		if (fits) return offset;
	}
	// 마지막 후보(트랙 끝)는 항상 비어 있다
	return candidateStarts[candidateStarts.length - 1] - groupStart;
}
