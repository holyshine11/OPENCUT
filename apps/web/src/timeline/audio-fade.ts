/** 페이드 곡선. 0~1 진행도를 게인으로 바꾼다 */
export const FADE_CURVES = {
	linear: (progress: number) => progress,
	equalPower: (progress: number) => Math.sin((progress * Math.PI) / 2),
	exponential: (progress: number) => progress * progress,
	logarithmic: (progress: number) => 1 - (1 - progress) * (1 - progress),
	sCurve: (progress: number) => (1 - Math.cos(progress * Math.PI)) / 2,
} as const satisfies Record<string, (progress: number) => number>;

export type FadeCurveId = keyof typeof FADE_CURVES;

export const DEFAULT_FADE_CURVE: FadeCurveId = "linear";
/** 크로스페이드는 두 클립 합이 일정한 크기로 들리도록 등파워 곡선을 쓴다 */
export const CROSSFADE_CURVE: FadeCurveId = "equalPower";

function isFadeCurveId(value: unknown): value is FadeCurveId {
	return typeof value === "string" && Object.hasOwn(FADE_CURVES, value);
}

export function toFadeCurveId(value: unknown): FadeCurveId {
	return isFadeCurveId(value) ? value : DEFAULT_FADE_CURVE;
}

export function applyFadeCurve({
	curve,
	progress,
}: {
	curve: FadeCurveId;
	progress: number;
}): number {
	return FADE_CURVES[curve](Math.min(1, Math.max(0, progress)));
}

/** 길이 durationSeconds 클립의 localTime(초)에서 페이드 인·아웃을 곱한 게인 */
export function fadeGainAt({
	fadeIn,
	fadeOut,
	fadeInCurve = DEFAULT_FADE_CURVE,
	fadeOutCurve = DEFAULT_FADE_CURVE,
	durationSeconds,
	localTime,
}: {
	fadeIn: number;
	fadeOut: number;
	fadeInCurve?: FadeCurveId;
	fadeOutCurve?: FadeCurveId;
	durationSeconds: number;
	localTime: number;
}): number {
	const inGain =
		fadeIn > 0
			? applyFadeCurve({ curve: fadeInCurve, progress: localTime / fadeIn })
			: 1;
	const outGain =
		fadeOut > 0
			? applyFadeCurve({
					curve: fadeOutCurve,
					progress: (durationSeconds - localTime) / fadeOut,
				})
			: 1;
	return inGain * outGain;
}

/** 크로스페이드 계산에 쓰는 클립 구간(초). handle은 클립 밖에 남은 원본 길이 */
export interface CrossfadeSpan {
	id: string;
	start: number;
	end: number;
	handleBefore: number;
	handleAfter: number;
	/** 다음 클립과의 크로스페이드 길이 */
	crossfade: number;
}

/**
 * 클립을 앞뒤로 늘릴 길이와 그 구간의 페이드 길이.
 * 화면의 클립은 맞붙은 그대로 두고, 소리만 원본의 남은 부분으로 겹쳐 섞는다
 */
export interface CrossfadeExtent {
	before: number;
	after: number;
	fadeIn: number;
	fadeOut: number;
}

const ADJACENT_EPSILON_SECONDS = 1e-6;

export function resolveCrossfades({
	spans,
}: {
	spans: readonly CrossfadeSpan[];
}): Map<string, CrossfadeExtent> {
	const sorted = [...spans].sort((a, b) => a.start - b.start);
	const extents = new Map<string, CrossfadeExtent>();
	const extentOf = (id: string) =>
		extents.get(id) ?? { before: 0, after: 0, fadeIn: 0, fadeOut: 0 };

	for (let i = 0; i < sorted.length - 1; i++) {
		const left = sorted[i];
		const right = sorted[i + 1];
		if (left.crossfade <= 0) continue;
		if (Math.abs(right.start - left.end) > ADJACENT_EPSILON_SECONDS) continue;

		const total = Math.min(
			left.crossfade,
			left.end - left.start,
			right.end - right.start,
		);
		// 경계를 가운데에 두되, 한쪽 원본이 모자라면 다른 쪽으로 더 늘린다
		let after = Math.min(total / 2, left.handleAfter);
		const before = Math.min(total - after, right.handleBefore);
		after = Math.min(total - before, left.handleAfter);
		const length = before + after;
		if (length <= 0) continue;

		extents.set(left.id, { ...extentOf(left.id), after, fadeOut: length });
		extents.set(right.id, { ...extentOf(right.id), before, fadeIn: length });
	}
	return extents;
}
