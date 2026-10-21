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

/** 이어 붙인 오디오 안의 구간. `at`은 이어 붙인 오디오에서 이 구간이 시작하는 시각 */
export interface JoinedRegion extends TimeRange {
	at: number;
}

/**
 * 말하는 구간만 이어 붙인 배치를 만든다. 구간 사이 무음은 `joinSeconds`까지만 남긴다.
 * 긴 무음이 끼어 있으면 Whisper가 그 사이 말을 빼먹고 단어 시간도 무음 너머로 밀려서다
 */
export function joinRegions({
	regions,
	joinSeconds,
}: {
	regions: readonly TimeRange[];
	joinSeconds: number;
}): JoinedRegion[] {
	const joined: JoinedRegion[] = [];
	for (const region of regions) {
		const previous = joined.at(-1);
		const at = previous
			? previous.at + previous.end - previous.start + Math.min(joinSeconds, region.start - previous.end)
			: 0;
		joined.push({ ...region, at });
	}
	return joined;
}

export function joinedLength({ joined }: { joined: readonly JoinedRegion[] }): number {
	const last = joined.at(-1);
	return last ? last.at + last.end - last.start : 0;
}

/**
 * 이어 붙인 오디오의 단어 구간을 원래 시각으로 되돌린다. 단어는 가장 많이 겹치는 구간 하나 안에 둔다.
 * 그대로 되돌리면 구간 경계에 걸친 단어가 그 사이의 긴 무음을 통째로 차지한다
 */
export function toOriginalRange({
	joined,
	start,
	end,
}: {
	joined: readonly JoinedRegion[];
	start: number;
	end: number;
}): TimeRange {
	const overlap = (region: JoinedRegion) =>
		Math.min(end, region.at + region.end - region.start) - Math.max(start, region.at);
	const region = joined.reduce((best, candidate) => (overlap(candidate) > overlap(best) ? candidate : best));
	const clamp = (time: number) => Math.min(region.end, Math.max(region.start, region.start + time - region.at));
	return { start: clamp(start), end: clamp(end) };
}

/** 어떤 단어와도 겹치지 않은 말하는 구간 가운데 `minSeconds` 이상인 것. 더 짧은 소리는 군말일 때가 많아 다시 듣지 않는다 */
export function findMissedRegions({
	regions,
	words,
	minSeconds,
}: {
	regions: readonly TimeRange[];
	words: readonly TimeRange[];
	minSeconds: number;
}): TimeRange[] {
	return regions.filter(
		(region) =>
			region.end - region.start >= minSeconds &&
			!words.some((word) => word.start <= region.end && region.start <= word.end),
	);
}

/**
 * 말하는 구간을 Whisper 한 번에 넣을 묶음으로 나눈다. 길이는 무음을 줄여 이어 붙인 길이로 잰다
 * (`joinRegions`). 최대 길이보다 긴 구간은 잘라서 넣는다
 */
export function groupSpeechRegions({
	regions,
	maxGroupSeconds,
	joinSeconds,
}: {
	regions: TimeRange[];
	maxGroupSeconds: number;
	joinSeconds: number;
}): TimeRange[][] {
	const groups: TimeRange[][] = [];
	for (const region of regions) {
		// ponytail: 한 구간이 최대 길이보다 길면 그냥 자른다. 단어가 잘리면 침묵이 가장 긴 지점에서 자르도록 바꾼다
		for (let start = region.start; start < region.end; start += maxGroupSeconds) {
			const piece = { start, end: Math.min(region.end, start + maxGroupSeconds) };
			const last = groups.at(-1);
			if (last && joinedLength({ joined: joinRegions({ regions: [...last, piece], joinSeconds }) }) <= maxGroupSeconds) {
				last.push(piece);
			} else {
				groups.push([piece]);
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
