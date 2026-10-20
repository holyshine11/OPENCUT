import { detectSpeechRegions, type TimeRange } from "@/transcription/speech-regions";
import type settingsFile from "./settings.json";

/**
 * 문자열 유니언으로 둔다(enum 금지 규칙).
 * static은 말 없이 화면이 멈춘 구간, process는 말 없이 젓기·끓이기가 이어지는 구간
 */
export type CutReason = "silence" | "filler" | "retake" | "static" | "process";

/** 잘라 내거나 빠르게 넘길 것을 제안하는 구간. 시간은 소스 기준(초) */
export interface CutProposal {
	id: string;
	start: number;
	end: number;
	reason: CutReason;
	enabled: boolean;
	/** 있으면 자르지 않고 이 배속으로 넘긴다 */
	rate?: number;
	/** 목록에 보여 줄 한 줄 설명 */
	note?: string;
}

export type AutocutSettings = typeof settingsFile;

/** 창마다 RMS를 dBFS로 잰다. 완전한 무음은 `silentDb`로 둔다 */
export function computeWindowLevels({
	audio,
	windowSamples,
	silentDb,
}: {
	audio: Float32Array;
	windowSamples: number;
	silentDb: number;
}): Float32Array {
	const levels = new Float32Array(Math.ceil(audio.length / windowSamples));
	for (let i = 0; i < levels.length; i++) {
		const start = i * windowSamples;
		const end = Math.min(audio.length, start + windowSamples);
		let sum = 0;
		for (let j = start; j < end; j++) sum += audio[j] * audio[j];
		const rms = Math.sqrt(sum / Math.max(1, end - start));
		levels[i] = rms > 0 ? Math.max(silentDb, 20 * Math.log10(rms)) : silentDb;
	}
	return levels;
}

/**
 * 이보다 조용하면 죽은 시간으로 본다. 녹음마다 바닥 소음이 달라서 고정값 대신
 * 하위 퍼센타일을 바닥 소음으로 잡고 여유를 더한다
 */
export function resolveQuietDb({
	levels,
	level,
}: {
	levels: Float32Array;
	level: AutocutSettings["level"];
}): number {
	if (levels.length === 0) return level.minNoiseFloorDb + level.quietMarginDb;
	const sorted = Float32Array.from(levels).sort();
	const index = Math.min(
		sorted.length - 1,
		Math.floor((sorted.length * level.noiseFloorPercentile) / 100),
	);
	// 화면 녹화처럼 디지털 무음이 많으면 바닥이 -120dB까지 내려가 실내 소음까지 "소리"가 되므로 아래를 막는다
	const noiseFloor = Math.max(level.minNoiseFloorDb, sorted[index]);
	return Math.min(level.maxQuietDb, noiseFloor + level.quietMarginDb);
}

/**
 * 말도 없고 조용한 구간을 잘라 낼 후보로 고른다.
 * - 말소리(VAD 또는 받아쓴 단어)와 겹치는 창은 절대 자르지 않는다
 * - 말은 없어도 소리가 큰 창(끓는 소리, 칼질)은 `cutAmbient`가 꺼져 있으면 남긴다
 * - 말 끝 잔향과 말 시작 전 숨은 여유로 남기고, 그 안에서 가장 조용한 창으로 컷 위치를 옮긴다
 */
export function proposeSilenceCuts({
	probabilities,
	levels,
	windowSeconds,
	words = [],
	frameSeconds,
	settings,
}: {
	probabilities: ArrayLike<number>;
	levels: Float32Array;
	windowSeconds: number;
	words?: readonly TimeRange[];
	frameSeconds?: number;
	settings: AutocutSettings;
}): CutProposal[] {
	const { silence } = settings;
	const windowCount = probabilities.length;
	const totalSeconds = windowCount * windowSeconds;
	const quietDb = resolveQuietDb({ levels, level: settings.level });
	const speechRanges = collectSpeechRanges({ probabilities, windowSeconds, words, settings });

	const dead = new Uint8Array(windowCount);
	for (let i = 0; i < windowCount; i++) {
		dead[i] = silence.cutAmbient || levels[i] <= quietDb ? 1 : 0;
	}
	for (const range of speechRanges) {
		const from = Math.max(0, Math.floor(range.start / windowSeconds + 1e-9));
		const to = Math.min(windowCount, Math.ceil(range.end / windowSeconds - 1e-9));
		dead.fill(0, from, to);
	}

	const proposals: CutProposal[] = [];
	let i = 0;
	while (i < windowCount) {
		if (!dead[i]) {
			i++;
			continue;
		}
		const runStart = i;
		while (i < windowCount && dead[i]) i++;
		const run = { start: runStart * windowSeconds, end: i * windowSeconds };
		if (run.end - run.start < silence.minSilenceSeconds) continue;

		const atStart = runStart === 0;
		const atEnd = i === windowCount;
		let start = atStart ? 0 : run.start + silence.keepAfterSpeechSeconds;
		let end = atEnd ? totalSeconds : run.end - silence.keepBeforeSpeechSeconds;
		if (!atStart) {
			start = quietestWindowStart({
				levels,
				windowSeconds,
				from: start,
				to: Math.min(end, start + silence.snapRadiusSeconds),
			});
		}
		if (!atEnd) {
			end = quietestWindowEnd({
				levels,
				windowSeconds,
				from: Math.max(start, end - silence.snapRadiusSeconds),
				to: end,
			});
		}
		// 프레임에 맞출 때는 자르는 구간이 줄어드는 쪽으로 반올림한다
		if (frameSeconds) {
			start = Math.ceil(start / frameSeconds - 1e-9) * frameSeconds;
			end = Math.floor(end / frameSeconds + 1e-9) * frameSeconds;
		}
		if (end - start < silence.minCutSeconds) continue;
		proposals.push({
			id: `silence:${start.toFixed(3)}`,
			start,
			end,
			reason: "silence",
			enabled: true,
		});
	}
	return proposals;
}

/** VAD가 말소리로 본 구간과 받아쓴 단어 구간. 겹쳐도 합치지 않는다 */
export function collectSpeechRanges({
	probabilities,
	windowSeconds,
	words = [],
	settings,
}: {
	probabilities: ArrayLike<number>;
	windowSeconds: number;
	words?: readonly TimeRange[];
	settings: AutocutSettings;
}): TimeRange[] {
	const { speech } = settings;
	return [
		...detectSpeechRegions({
			probabilities,
			windowSeconds,
			threshold: speech.threshold,
			minSilenceSeconds: speech.mergeSeconds,
			minSpeechSeconds: speech.minSpeechSeconds,
			speechPadSeconds: 0,
			totalSeconds: probabilities.length * windowSeconds,
		}),
		...words,
	];
}

/** [from, to] 안에서 시작하는 창 중 가장 조용한 창의 시작 시각. 그런 창이 없으면 from */
function quietestWindowStart({
	levels,
	windowSeconds,
	from,
	to,
}: {
	levels: Float32Array;
	windowSeconds: number;
	from: number;
	to: number;
}): number {
	let best = from;
	let bestLevel = Number.POSITIVE_INFINITY;
	for (let k = Math.ceil(from / windowSeconds - 1e-9); k * windowSeconds <= to; k++) {
		if (levels[k] < bestLevel) {
			bestLevel = levels[k];
			best = k * windowSeconds;
		}
	}
	return best;
}

/** [from, to] 안에서 끝나는 창 중 가장 조용한 창의 끝 시각. 그런 창이 없으면 to */
function quietestWindowEnd({
	levels,
	windowSeconds,
	from,
	to,
}: {
	levels: Float32Array;
	windowSeconds: number;
	from: number;
	to: number;
}): number {
	let best = to;
	let bestLevel = Number.POSITIVE_INFINITY;
	for (let k = Math.floor(to / windowSeconds + 1e-9); k * windowSeconds >= from && k > 0; k--) {
		if (levels[k - 1] < bestLevel) {
			bestLevel = levels[k - 1];
			best = k * windowSeconds;
		}
	}
	return best;
}
