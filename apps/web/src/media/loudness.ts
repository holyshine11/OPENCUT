/**
 * ITU-R BS.1770 / EBU R128 라우드니스 계산.
 * 블록 파워는 K-가중을 거친 채널별 평균 제곱의 합이다.
 */

export const LOUDNESS_BLOCK_SECONDS = 0.4;
export const LOUDNESS_HOP_SECONDS = 0.1;
export const SHORT_TERM_SECONDS = 3;
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;

/**
 * K-가중 필터. Web Audio 바이쿼드(highshelf: Q=1/√2 고정, highpass: Q가 dB)로
 * pyloudnorm과 같은 계수를 만든다. highpass Q 0.5 = 20·log10(0.5) dB.
 */
export const K_WEIGHTING = {
	shelf: { frequency: 1500, gainDb: 4 },
	highpass: { frequency: 38, qDb: 20 * Math.log10(0.5) },
} as const;

export function powerToLufs(power: number): number {
	return power > 0 ? -0.691 + 10 * Math.log10(power) : Number.NEGATIVE_INFINITY;
}

/** 배열 끝 count개 샘플의 평균 제곱 */
export function meanSquareTail({
	samples,
	count,
}: {
	samples: Float32Array;
	count: number;
}): number {
	const length = Math.min(count, samples.length);
	if (length <= 0) return 0;
	let sum = 0;
	for (let i = samples.length - length; i < samples.length; i++) {
		sum += samples[i] * samples[i];
	}
	return sum / length;
}

/** 블록 파워들의 평균을 LUFS로 (숏텀 등 게이트 없는 창) */
export function averageLufs(blockPowers: readonly number[]): number {
	if (blockPowers.length === 0) return Number.NEGATIVE_INFINITY;
	let sum = 0;
	for (const power of blockPowers) sum += power;
	return powerToLufs(sum / blockPowers.length);
}

/** 통합 라우드니스: -70 LUFS 절대 게이트 → 평균 -10 LU 상대 게이트 */
export function integratedLufs(blockPowers: readonly number[]): number {
	const aboveAbsolute = blockPowers.filter(
		(power) => powerToLufs(power) > ABSOLUTE_GATE_LUFS,
	);
	if (aboveAbsolute.length === 0) return Number.NEGATIVE_INFINITY;
	const relativeGate = averageLufs(aboveAbsolute) + RELATIVE_GATE_LU;
	return averageLufs(
		aboveAbsolute.filter((power) => powerToLufs(power) > relativeGate),
	);
}
