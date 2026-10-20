import { getClipTimeAtSourceTime, getSourceTimeAtClipTime } from "@/retime";
import { isRetimableElement } from "@/timeline/element-utils";
import type { SceneTracks, TimelineElement } from "@/timeline/types";
import type { TimeRange } from "@/transcription/speech-regions";
import type { FrameRate } from "opencut-wasm";
import { addMediaTime, type MediaTime, mediaTimeFromSeconds, mediaTimeToSeconds, roundFrameTime } from "@/wasm";

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

/** 자막 단어 하나. 시간은 클립 소스 기준(초). 단어 수와 단어 시각 수가 안 맞는 자막이면 글자는 빈 문자열이다 */
export type SubtitleWord = TimeRange & { text: string };

/**
 * 클립 위에 놓인 자막의 단어 시각을 클립의 소스 시간(초)으로 모은다.
 * 단어 끝은 다음 단어 시작이나 자막 끝이다
 */
export function collectSubtitleWords({
	tracks,
	element,
}: {
	tracks: SceneTracks;
	element: TimelineElement;
}): SubtitleWord[] {
	const clipStart = seconds(element.startTime);
	const clipEnd = clipStart + seconds(element.duration);
	const toSource = (timelineSeconds: number) => timelineToSource({ element, timelineSeconds });

	const words: SubtitleWord[] = [];
	for (const track of tracks) {
		for (const text of track.elements) {
			if (text.type !== "text" || !text.subtitleWordOffsets?.length) continue;
			const origin = seconds(text.startTime) - seconds(text.trimStart);
			const textEnd = seconds(text.startTime) + seconds(text.duration);
			const starts = text.subtitleWordOffsets.map((offset) => origin + offset);
			// 단어 나누기는 자막 목록(subtitles/edit.ts)과 같이 공백 기준
			const texts = String(text.params.content ?? "").split(/\s+/).filter(Boolean);
			const textOf = (index: number) => (texts.length === starts.length ? texts[index] : "");
			starts.forEach((start, index) => {
				const end = Math.min(textEnd, starts[index + 1] ?? textEnd);
				if (end <= start || end <= clipStart || start >= clipEnd) return;
				words.push({
					start: toSource(Math.max(start, clipStart)),
					end: toSource(Math.min(end, clipEnd)),
					text: textOf(index),
				});
			});
		}
	}
	return words;
}
