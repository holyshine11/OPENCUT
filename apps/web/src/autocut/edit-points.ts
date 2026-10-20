import type { TimeRange } from "@/transcription/speech-regions";
import type { AutocutSettings } from "./silence";

/**
 * RGBA 두 프레임의 평균 밝기 차이(0~255). 가로 160px 기준으로 손이 들어오면 10~30,
 * 끓거나 젓는 냄비는 4~15, 멈춘 화면은 1~2 정도 나온다
 */
export function frameDifference({
	previous,
	next,
}: {
	previous: Uint8ClampedArray;
	next: Uint8ClampedArray;
}): number {
	let sum = 0;
	for (let i = 0; i < next.length; i += 4) {
		sum += Math.abs(
			0.299 * (next[i] - previous[i]) +
				0.587 * (next[i + 1] - previous[i + 1]) +
				0.114 * (next[i + 2] - previous[i + 2]),
		);
	}
	return sum / Math.max(1, next.length / 4);
}

/** 문자열 유니언으로 둔다(enum 금지 규칙). 지점 바로 뒤에 무엇이 시작되는지다 */
export type EditPointReason = "speechStart" | "speechEnd" | "motionStart" | "motionStop" | "event";

/** 클립을 나눌 지점 하나. 시간은 소스 기준(초) */
export interface EditPoint {
	id: string;
	time: number;
	reason: EditPointReason;
	enabled: boolean;
}

// 같은 자리에 겹친 지점은 말 경계를 먼저 남긴다
const PRIORITY: Record<EditPointReason, number> = { speechStart: 3, speechEnd: 3, event: 2, motionStart: 1, motionStop: 1 };

/**
 * 말과 화면 움직임으로 클립을 나눌 지점을 찾는다. 자르거나 빠르게 넘길지는 정하지 않고 쪼갤 자리만 준다.
 * - 말 한 마디(`pauseSeconds`보다 짧은 쉼은 한 마디)마다 시작 조금 앞과 끝 조금 뒤. `minUtteranceSeconds`보다 짧은 말(VAD 블립)은 말로 안 치고,
 *   `minPieceSeconds`보다 짧은 말은 시작 앞 한 지점만 낸다
 * - 말이 없는 구간에서 화면이 멈추거나 움직이기 시작하는 곳(`minRunSeconds`보다 짧은 덩어리는 무시)
 * - 말이 없는 구간에서 움직임이 `eventAbove`를 넘어서는 순간(손이 들어오거나 재료를 넣는 때)
 * - 지점 사이가 `minPieceSeconds`보다 짧으면 우선순위가 높은 쪽만 남기고, 같으면(말 사이 짧은 쉼 등) 가운데 한 지점으로 합친다
 *
 * `motion[i]`는 i번째와 i+1번째 샘플 프레임 사이의 `frameDifference`
 */
export function proposeEditPoints({
	motion,
	motionSeconds,
	speech,
	frameSeconds,
	settings,
}: {
	motion: ArrayLike<number>;
	motionSeconds: number;
	speech: readonly TimeRange[];
	frameSeconds?: number;
	settings: AutocutSettings;
}): EditPoint[] {
	const { editPoints: rules, motion: motionSettings } = settings;
	const totalSeconds = motion.length * motionSeconds;
	const utterances = mergeRanges({ ranges: speech, joinWithin: rules.pauseSeconds }).filter(
		(utterance) => utterance.end - utterance.start >= rules.minUtteranceSeconds,
	);
	const smoothed = medianFilter({ values: motion, size: rules.smoothWindows });

	const candidates: { time: number; reason: EditPointReason }[] = [];
	utterances.forEach((utterance, index) => {
		// 앞뒤 여유는 쉼의 절반을 넘지 않아 이웃 말의 지점과 순서가 뒤집히지 않는다
		const before = index > 0 ? (utterance.start - utterances[index - 1].end) / 2 : Number.POSITIVE_INFINITY;
		const after = index < utterances.length - 1 ? (utterances[index + 1].start - utterance.end) / 2 : Number.POSITIVE_INFINITY;
		const start = utterance.start - Math.min(rules.speechBeforeSeconds, before);
		const end = utterance.end + Math.min(rules.speechAfterSeconds, after);
		candidates.push({ time: start, reason: "speechStart" });
		if (end - start >= rules.minPieceSeconds) candidates.push({ time: end, reason: "speechEnd" });
	});
	for (const gap of complementRanges({ ranges: utterances, totalSeconds })) {
		const runs = splitByMotion({ gap, smoothed, motionSeconds, staticBelow: motionSettings.staticBelow, minRunSeconds: rules.minRunSeconds });
		for (const run of runs.slice(1)) candidates.push({ time: run.start, reason: run.moving ? "motionStart" : "motionStop" });
		const from = Math.ceil(gap.start / motionSeconds - 1e-9);
		const to = Math.min(smoothed.length, Math.floor(gap.end / motionSeconds + 1e-9));
		for (let i = Math.max(1, from); i < to; i++) {
			if (smoothed[i] >= rules.eventAbove && smoothed[i - 1] < rules.eventAbove) {
				candidates.push({ time: i * motionSeconds, reason: "event" });
			}
		}
	}

	const snap = (time: number) => (frameSeconds ? Math.round(time / frameSeconds) * frameSeconds : time);
	const points: EditPoint[] = [];
	for (const candidate of candidates.map((c) => ({ ...c, time: snap(c.time) })).sort((a, b) => a.time - b.time)) {
		if (candidate.time < rules.minPieceSeconds || candidate.time > totalSeconds - rules.minPieceSeconds) continue;
		const last = points.at(-1);
		if (last && candidate.time - last.time < rules.minPieceSeconds) {
			const gap = PRIORITY[candidate.reason] - PRIORITY[last.reason];
			if (gap > 0) points[points.length - 1] = toPoint(candidate);
			else if (gap === 0) points[points.length - 1] = toPoint({ ...candidate, time: snap((last.time + candidate.time) / 2) });
			continue;
		}
		points.push(toPoint(candidate));
	}
	return points;
}

const toPoint = ({ time, reason }: { time: number; reason: EditPointReason }): EditPoint => ({
	id: `${reason}:${time.toFixed(3)}`,
	time,
	reason,
	enabled: true,
});

/** 빈 구간 하나를 멈춤/움직임 덩어리로 나눈다. `minRunSeconds`보다 짧은 덩어리는 앞 덩어리에 붙인다 */
function splitByMotion({
	gap,
	smoothed,
	motionSeconds,
	staticBelow,
	minRunSeconds,
}: {
	gap: TimeRange;
	smoothed: Float32Array;
	motionSeconds: number;
	staticBelow: number;
	minRunSeconds: number;
}): (TimeRange & { moving: boolean })[] {
	const runs: (TimeRange & { moving: boolean })[] = [];
	const from = Math.floor(gap.start / motionSeconds + 1e-9);
	const to = Math.min(smoothed.length, Math.ceil(gap.end / motionSeconds - 1e-9));
	for (let i = from; i < to; i++) {
		const run = {
			start: Math.max(gap.start, i * motionSeconds),
			end: Math.min(gap.end, (i + 1) * motionSeconds),
			moving: smoothed[i] >= staticBelow,
		};
		const last = runs.at(-1);
		if (last && last.moving === run.moving) last.end = run.end;
		else runs.push(run);
	}

	const merged: (TimeRange & { moving: boolean })[] = [];
	for (const run of runs) {
		const last = merged.at(-1);
		if (last && (last.moving === run.moving || run.end - run.start < minRunSeconds)) last.end = run.end;
		else merged.push({ ...run });
	}
	// 맨 앞 덩어리는 붙일 앞이 없으니 뒤에 붙인다
	if (merged.length > 1 && merged[0].end - merged[0].start < minRunSeconds) {
		merged[1].start = merged[0].start;
		merged.shift();
	}
	return merged;
}

function medianFilter({ values, size }: { values: ArrayLike<number>; size: number }): Float32Array {
	const half = Math.floor(size / 2);
	const out = new Float32Array(values.length);
	for (let i = 0; i < values.length; i++) {
		const window: number[] = [];
		for (let k = Math.max(0, i - half); k <= Math.min(values.length - 1, i + half); k++) window.push(values[k]);
		window.sort((a, b) => a - b);
		out[i] = window[Math.floor(window.length / 2)];
	}
	return out;
}

/** 겹치거나 `joinWithin`초 안에 이어지는 구간을 합친다 */
function mergeRanges({ ranges, joinWithin }: { ranges: readonly TimeRange[]; joinWithin: number }): TimeRange[] {
	const merged: TimeRange[] = [];
	for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
		const last = merged.at(-1);
		if (last && range.start <= last.end + joinWithin) last.end = Math.max(last.end, range.end);
		else merged.push({ ...range });
	}
	return merged;
}

function complementRanges({ ranges, totalSeconds }: { ranges: readonly TimeRange[]; totalSeconds: number }): TimeRange[] {
	const gaps: TimeRange[] = [];
	let cursor = 0;
	for (const range of ranges) {
		if (range.start > cursor) gaps.push({ start: cursor, end: range.start });
		cursor = Math.max(cursor, range.end);
	}
	if (cursor < totalSeconds) gaps.push({ start: cursor, end: totalSeconds });
	return gaps;
}
