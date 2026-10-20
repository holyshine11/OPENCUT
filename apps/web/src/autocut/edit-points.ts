import type { TimeRange } from "@/transcription/speech-regions";
import type { AutocutSettings, CutProposal } from "./silence";

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

/**
 * 말이 없는 구간을 화면 움직임으로 나눠 편집점을 제안한다. 고정 카메라 요리 영상처럼
 * 배경 소음 때문에 무음이 하나도 없는 영상을 위한 규칙이다.
 * - 말(VAD·자막 단어)과 그 앞뒤 여유는 남긴다
 * - 말 사이가 `minGapSeconds`보다 짧으면 자연스러운 쉼으로 보고 남긴다
 * - 그보다 긴 빈 구간에서 화면이 멈춘 곳은 컷, 움직이는 곳(젓기·끓이기)은 배속으로 제안한다
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
}): CutProposal[] {
	const { editPoints: rules, motion: motionSettings } = settings;
	const totalSeconds = motion.length * motionSeconds;
	const kept = mergeRanges(
		speech.map((range) => ({
			start: Math.max(0, range.start - rules.speechBeforeSeconds),
			end: Math.min(totalSeconds, range.end + rules.speechAfterSeconds),
		})),
	);

	const smoothed = medianFilter({ values: motion, size: rules.smoothWindows });
	const proposals: CutProposal[] = [];
	for (const gap of complementRanges({ ranges: kept, totalSeconds })) {
		if (gap.end - gap.start < rules.minGapSeconds) continue;
		for (const run of splitByMotion({
			gap,
			smoothed,
			motionSeconds,
			staticBelow: motionSettings.staticBelow,
			minRunSeconds: rules.minGapSeconds,
		})) {
			// 프레임에 맞출 때는 제안 구간이 줄어드는 쪽으로 반올림한다
			const start = frameSeconds ? Math.ceil(run.start / frameSeconds - 1e-9) * frameSeconds : run.start;
			const end = frameSeconds ? Math.floor(run.end / frameSeconds + 1e-9) * frameSeconds : run.end;
			if (end <= start) continue;
			if (!run.moving) {
				proposals.push({ id: `static:${start.toFixed(3)}`, start, end, reason: "static", enabled: true });
				continue;
			}
			const rate = fitRate({ seconds: end - start, rules });
			if (rate < rules.minRate) continue;
			proposals.push({ id: `process:${start.toFixed(3)}`, start, end, reason: "process", enabled: true, rate });
		}
	}
	return proposals;
}

/** 구간이 `targetSeconds` 안팎이 되는 배속. `rateStep` 단위로 내리고 `maxRate`를 넘지 않는다. `minRate`보다 작을 수 있다 */
export function fitRate({ seconds, rules }: { seconds: number; rules: AutocutSettings["editPoints"] }): number {
	return Math.min(rules.maxRate, Math.floor(seconds / rules.targetSeconds / rules.rateStep) * rules.rateStep);
}

/** 고를 수 있는 배속 목록 (`minRate`부터 `maxRate`까지 `rateStep` 간격) */
export function rateChoices({ rules }: { rules: AutocutSettings["editPoints"] }): number[] {
	const count = Math.floor((rules.maxRate - rules.minRate) / rules.rateStep + 1e-9) + 1;
	return Array.from({ length: count }, (_, i) => rules.minRate + i * rules.rateStep);
}

/**
 * 빈 구간 하나를 멈춤/움직임 덩어리로 나눈다. `minRunSeconds`보다 짧은 덩어리는 앞 덩어리에 붙여
 * 손이 잠깐 들어온 정도로 구간이 잘게 쪼개지지 않게 한다
 */
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

function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
	const merged: TimeRange[] = [];
	for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
		const last = merged.at(-1);
		if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
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
