import type { TranscriptionWord } from "./types";

export interface TimeRange {
	start: number;
	end: number;
}

/** VAD 창별 말소리 확률을 말하는 구간 목록으로 바꾼다 */
export function detectSpeechRegions({
	probabilities,
	windowSeconds,
	threshold,
	minSilenceSeconds,
	minSpeechSeconds,
	speechPadSeconds,
	totalSeconds,
}: {
	probabilities: ArrayLike<number>;
	windowSeconds: number;
	threshold: number;
	minSilenceSeconds: number;
	minSpeechSeconds: number;
	speechPadSeconds: number;
	totalSeconds: number;
}): TimeRange[] {
	const raw: TimeRange[] = [];
	let start: number | null = null;
	let silenceStart: number | null = null;

	for (let i = 0; i < probabilities.length; i++) {
		const time = i * windowSeconds;
		if (probabilities[i] >= threshold) {
			start ??= time;
			silenceStart = null;
			continue;
		}
		if (start === null) continue;
		silenceStart ??= time;
		if (time + windowSeconds - silenceStart >= minSilenceSeconds) {
			raw.push({ start, end: silenceStart });
			start = null;
			silenceStart = null;
		}
	}
	if (start !== null) {
		raw.push({ start, end: silenceStart ?? probabilities.length * windowSeconds });
	}

	const padded: TimeRange[] = [];
	for (const region of raw) {
		if (region.end - region.start < minSpeechSeconds) continue;
		const next = {
			start: Math.max(0, region.start - speechPadSeconds),
			end: Math.min(totalSeconds, region.end + speechPadSeconds),
		};
		const last = padded.at(-1);
		if (last && next.start <= last.end) {
			last.end = next.end;
		} else {
			padded.push(next);
		}
	}
	return padded;
}

/** 말하는 구간을 Whisper 한 번에 넣을 수 있는 길이로 묶는다 */
export function groupSpeechRegions({
	regions,
	maxGroupSeconds,
}: {
	regions: TimeRange[];
	maxGroupSeconds: number;
}): TimeRange[] {
	const groups: TimeRange[] = [];
	for (const region of regions) {
		// ponytail: 한 구간이 최대 길이보다 길면 그냥 자른다. 단어가 잘리면 침묵이 가장 긴 지점에서 자르도록 바꾼다
		for (let start = region.start; start < region.end; start += maxGroupSeconds) {
			const piece = { start, end: Math.min(region.end, start + maxGroupSeconds) };
			const last = groups.at(-1);
			if (last && piece.end - last.start <= maxGroupSeconds) {
				last.end = piece.end;
			} else {
				groups.push(piece);
			}
		}
	}
	return groups;
}

function normalizeForMatch(text: string): string {
	return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function overlapRatio({
	range,
	regions,
}: {
	range: TimeRange;
	regions: TimeRange[];
}): number {
	const length = range.end - range.start;
	if (length <= 0) return 1;
	let overlap = 0;
	for (const region of regions) {
		overlap += Math.max(
			0,
			Math.min(range.end, region.end) - Math.max(range.start, region.start),
		);
	}
	return overlap / length;
}

/**
 * Whisper가 지어내는 단어를 걸러 낸다.
 * - 같은 1~N단어 묶음이 maxRepeats번보다 많이 연달아 나오면 maxRepeats번만 남긴다
 * - 알려진 환각 문구가 말소리가 거의 없는 곳에 나오면 지운다. 실제로 "시청해 주셔서 감사합니다"라고 말한 경우는 남긴다
 */
export function filterHallucinations({
	words,
	speechRegions,
	maxRepeats,
	maxRepeatNgram,
	minSpeechOverlap,
	phrases,
}: {
	words: TranscriptionWord[];
	speechRegions: TimeRange[];
	maxRepeats: number;
	maxRepeatNgram: number;
	minSpeechOverlap: number;
	phrases: readonly string[];
}): TranscriptionWord[] {
	let result = [...words];

	for (let size = 1; size <= maxRepeatNgram; size++) {
		const kept: TranscriptionWord[] = [];
		let i = 0;
		while (i < result.length) {
			const gram = result.slice(i, i + size);
			const key = gram.map((word) => normalizeForMatch(word.text)).join(" ");
			let repeats = 1;
			while (
				i + (repeats + 1) * size <= result.length &&
				result
					.slice(i + repeats * size, i + (repeats + 1) * size)
					.map((word) => normalizeForMatch(word.text))
					.join(" ") === key
			) {
				repeats++;
			}
			const keepRepeats = gram.length === size ? Math.min(repeats, maxRepeats) : 1;
			for (let r = 0; r < keepRepeats; r++) {
				kept.push(...result.slice(i + r * size, i + (r + 1) * size));
			}
			i += Math.max(repeats, 1) * gram.length;
		}
		result = kept;
	}

	const normalizedPhrases = phrases.map(normalizeForMatch);
	const drop = new Set<number>();
	for (let start = 0; start < result.length; start++) {
		let joined = "";
		for (let end = start; end < result.length; end++) {
			joined += normalizeForMatch(result[end].text);
			if (!normalizedPhrases.some((phrase) => phrase.startsWith(joined))) break;
			if (!normalizedPhrases.includes(joined)) continue;
			const range = { start: result[start].start, end: result[end].end };
			if (overlapRatio({ range, regions: speechRegions }) < minSpeechOverlap) {
				for (let k = start; k <= end; k++) drop.add(k);
			}
		}
	}
	return result.filter((_, index) => !drop.has(index));
}
