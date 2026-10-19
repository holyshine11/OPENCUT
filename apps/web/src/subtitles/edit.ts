import type { CaptionChunk } from "@/transcription/types";

/**
 * 자막 목록에서 쓰는 자막. 만들 때 쓰는 CaptionChunk와 같은 내용을 시작·끝(초)으로 들고 있다.
 * 나누기·합치기·겹침 계산이 끝 시각 기준이라 길이 대신 끝을 쓴다
 */
export interface Cue extends Pick<CaptionChunk, "text" | "wordStarts"> {
	start: number;
	end: number;
}

const visibleLength = (text: string) => text.replace(/\s/g, "").length;
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

function usableWordStarts({ cue }: { cue: Cue }): number[] | undefined {
	return cue.wordStarts?.length === wordsOf(cue.text).length
		? cue.wordStarts
		: undefined;
}

/** 단어 사이에서 나눌 때 뒤 단어의 순번. 단어 시각을 쓸 수 없으면 null */
function wordIndexOf({
	cue,
	before,
	after,
}: {
	cue: Cue;
	before: string;
	after: string;
}): number | null {
	const wordStarts = usableWordStarts({ cue });
	const index = wordsOf(before).length;
	return wordStarts && index + wordsOf(after).length === wordStarts.length
		? index
		: null;
}

/**
 * 커서 위치(at, 글자 인덱스)에서 둘로 나눈다. 시간은 time이 있으면 그 시각에서,
 * 없으면 단어 사이를 나누고 단어 시간이 있을 때 뒤 단어가 시작한 때에서, 아니면 공백을 뺀 글자 수 비율로 나눈다
 */
export function splitCue({
	cue,
	at,
	time,
}: {
	cue: Cue;
	at: number;
	time?: number;
}): [Cue, Cue] | null {
	const before = cue.text.slice(0, at).trim();
	const after = cue.text.slice(at).trim();
	if (!before || !after) return null;

	const isInside = (value: number) => value > cue.start && value < cue.end;
	const index = wordIndexOf({ cue, before, after });
	const wordTime = index === null ? undefined : cue.wordStarts?.[index];
	const byWord = wordTime !== undefined && isInside(wordTime);
	const ratio =
		visibleLength(before) / (visibleLength(before) + visibleLength(after));
	const splitTime =
		time ?? (byWord ? wordTime : cue.start + (cue.end - cue.start) * ratio);
	if (!isInside(splitTime)) return null;

	// 정한 시각에서 나누면 단어 시각은 단어 경계대로 나눠 음성에 붙여 둔다
	if (index === null || (time === undefined && !byWord)) {
		return [
			{ text: before, start: cue.start, end: splitTime },
			{ text: after, start: splitTime, end: cue.end },
		];
	}
	return [
		{
			text: before,
			start: cue.start,
			end: splitTime,
			wordStarts: cue.wordStarts?.slice(0, index),
		},
		{
			text: after,
			start: splitTime,
			end: cue.end,
			wordStarts: cue.wordStarts?.slice(index),
		},
	];
}

/**
 * time(초)에서 자막을 나눌 때 글자를 가를 위치. 단어 시각이 있으면 시작 시각이 가장 가까운 단어 앞,
 * 없으면 공백을 뺀 글자 수 비율로 가장 가까운 단어 앞이다. 단어가 하나뿐이면 null
 */
export function splitIndexAtTime({
	cue,
	time,
}: {
	cue: Cue;
	time: number;
}): number | null {
	const words = [...cue.text.matchAll(/\S+/g)];
	if (words.length < 2) return null;
	const wordStarts = usableWordStarts({ cue });
	const target = wordStarts
		? time
		: ((time - cue.start) / (cue.end - cue.start)) * visibleLength(cue.text);
	let best: { index: number; distance: number } | null = null;
	let charsBefore = 0;
	for (const [order, word] of words.entries()) {
		if (order > 0) {
			const distance = Math.abs(
				(wordStarts ? wordStarts[order] : charsBefore) - target,
			);
			if (!best || distance < best.distance) {
				best = { index: word.index, distance };
			}
		}
		charsBefore += word[0].length;
	}
	return best?.index ?? null;
}

export function mergeCues({ first, second }: { first: Cue; second: Cue }): Cue {
	const firstWords = usableWordStarts({ cue: first });
	const secondWords = usableWordStarts({ cue: second });
	return {
		text: `${first.text.trim()} ${second.text.trim()}`,
		start: first.start,
		end: Math.max(first.end, second.end),
		wordStarts:
			firstWords && secondWords ? [...firstWords, ...secondWords] : undefined,
	};
}

/** 이웃 자막과 겹치지 않게 조인다. 끝이 시작보다 앞서면 null */
export function clampCueTiming({
	start,
	end,
	previousEnd,
	nextStart,
}: {
	start: number;
	end: number;
	previousEnd: number;
	nextStart: number | null;
}): { start: number; end: number } | null {
	const clampedStart = Math.max(start, previousEnd);
	const clampedEnd = nextStart === null ? end : Math.min(end, nextStart);
	return clampedEnd > clampedStart
		? { start: clampedStart, end: clampedEnd }
		: null;
}

/** "1:02.5"(분:초) 또는 "62.5"(초)를 초로 읽는다. 초 자리는 두 자리여야 한다 */
export function parseCueTime({ input }: { input: string }): number | null {
	const match = input
		.trim()
		.match(/^(?:(\d+):(\d{2}(?:\.\d+)?)|(\d+(?:\.\d+)?))$/);
	if (!match) return null;
	return match[3] !== undefined
		? Number(match[3])
		: Number(match[1]) * 60 + Number(match[2]);
}

export function formatCueTime({ seconds }: { seconds: number }): string {
	const tenths = Math.round(seconds * 10);
	const minutes = Math.floor(tenths / 600);
	return `${minutes}:${((tenths - minutes * 600) / 10).toFixed(1).padStart(4, "0")}`;
}

/** 모두 바꾸기. 검색어가 들어 있는 자막만, 바꾼 텍스트와 함께 돌려준다 */
export function planReplaceAll({
	cues,
	query,
	replacement,
}: {
	cues: { id: string; text: string }[];
	query: string;
	replacement: string;
}): { id: string; text: string }[] {
	if (!query) return [];
	return cues
		.filter((cue) => cue.text.includes(query))
		.map((cue) => ({
			id: cue.id,
			text: cue.text.split(query).join(replacement),
		}));
}
