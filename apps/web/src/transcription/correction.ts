import type settingsFile from "./settings.json";
import type { TranscriptionSegment, TranscriptionWord } from "./types";

export type CorrectionSettings = (typeof settingsFile)["correction"];

/** 사용자가 자막을 고쳐서 배운 바꿈 한 쌍. count는 같은 바꿈을 몇 번 했는지 */
export interface Correction {
	from: string;
	to: string;
	count: number;
}

const normalize = (text: string) => text.replace(/[\p{P}\p{S}\s]/gu, "");

/**
 * 고치기 전후 자막을 단어 단위로 맞춰 보고 바뀐 부분을 바꿈 쌍으로 돌려준다.
 * 조사가 같이 붙어 바뀐 경우("견고취가" → "건고추가")는 같은 끝 글자를 떼서 낱말만 남긴다.
 * 띄어쓰기·문장부호만 바뀐 것과 `maxPhraseWords`보다 긴 고쳐 쓰기는 버린다
 */
export function extractCorrections({
	before,
	after,
	maxPhraseWords,
}: {
	before: string;
	after: string;
	maxPhraseWords: number;
}): { from: string; to: string }[] {
	const a = before.split(/\s+/).filter(Boolean);
	const b = after.split(/\s+/).filter(Boolean);
	// 가장 긴 공통 단어열(LCS)로 같은 단어끼리 묶는다
	const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lcs[i][j] =
				normalize(a[i]) === normalize(b[j])
					? lcs[i + 1][j + 1] + 1
					: Math.max(lcs[i + 1][j], lcs[i][j + 1]);
		}
	}

	const runs: { from: string[]; to: string[] }[] = [];
	let run = { from: [] as string[], to: [] as string[] };
	const flush = () => {
		if (run.from.length > 0 || run.to.length > 0) runs.push(run);
		run = { from: [], to: [] };
	};
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && normalize(a[i]) === normalize(b[j])) {
			flush();
			i++;
			j++;
		} else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
			run.to.push(b[j++]);
		} else {
			run.from.push(a[i++]);
		}
	}
	flush();

	return runs.flatMap((replaced) => {
		if (replaced.from.length === 0 || replaced.to.length === 0) return [];
		if (replaced.from.length > maxPhraseWords || replaced.to.length > maxPhraseWords) return [];
		// 단어 수가 같으면 한 단어씩, 다르면 묶음 하나로("안경 찐떡" → "안동찜닭")
		const pairs =
			replaced.from.length === replaced.to.length
				? replaced.from.map((from, index) => ({ from, to: replaced.to[index] }))
				: [{ from: replaced.from.join(" "), to: replaced.to.join(" ") }];
		return pairs.flatMap((pair) => {
			const from = pair.from.replace(/[\p{P}\p{S}]+$/u, "");
			const to = pair.to.replace(/[\p{P}\p{S}]+$/u, "");
			if (!from || !to || normalize(from) === normalize(to)) return [];
			return [trimSharedSuffix({ from, to })];
		});
	});
}

/**
 * 끝 글자가 같으면 한 글자(조사)만 뗀다. 같은 끝을 다 떼면 "남궁진닭은 → 안동찜닭은"이 "남궁진 → 안동찜"이 돼
 * 힌트로 쓸 낱말이 망가진다. 떼고 남은 글자가 2자보다 짧으면 너무 흔한 바꿈이 되므로 그대로 둔다
 */
function trimSharedSuffix({ from, to }: { from: string; to: string }): { from: string; to: string } {
	const a = [...from];
	const b = [...to];
	if (a.at(-1) !== b.at(-1) || a.length < 3 || b.length < 2) return { from, to };
	return { from: a.slice(0, -1).join(""), to: b.slice(0, -1).join("") };
}

/**
 * 배운 바꿈을 새 받아쓰기에 적용한다. 단어 앞부분이 `from`과 같으면 `to`로 바꾸고 뒤(조사·문장부호)는 남긴다.
 * `trustCount`번 넘게 고친 바꿈은 늘 적용하고, 그보다 적으면 앞뒤 `contextSeconds` 안에 분량·동작 말
 * (`contextWords`, 예: 큰술·넣)이 있을 때만 적용한다. "술맛 아니고요" 같은 말장난을 함부로 고치지 않기 위해서다
 */
export function correctSegments({
	segments,
	corrections,
	settings,
}: {
	segments: readonly TranscriptionSegment[];
	corrections: readonly Correction[];
	settings: CorrectionSettings;
}): TranscriptionSegment[] {
	if (corrections.length === 0) return [...segments];
	// 여러 단어짜리 바꿈을 먼저 본다
	const ordered = [...corrections].sort((x, y) => y.from.split(" ").length - x.from.split(" ").length);
	const allWords = segments.flatMap((segment) => wordsOf({ segment }));
	const contextRanges = allWords.filter((word) =>
		settings.contextWords.some((contextWord) => word.text.includes(contextWord)),
	);
	const hasContext = (word: TranscriptionWord) =>
		contextRanges.some(
			(range) =>
				range.start - settings.contextSeconds <= word.end && range.end + settings.contextSeconds >= word.start,
		);

	return segments.map((segment) => {
		const words = wordsOf({ segment });
		const corrected: TranscriptionWord[] = [];
		let changed = false;
		for (let i = 0; i < words.length; ) {
			const match = ordered.find((correction) => {
				const size = correction.from.split(" ").length;
				if (i + size > words.length) return false;
				const candidate = words
					.slice(i, i + size)
					.map((word) => word.text)
					.join(" ");
				return (
					candidate.startsWith(correction.from) &&
					(correction.count >= settings.trustCount || hasContext(words[i]))
				);
			});
			if (!match) {
				corrected.push(words[i++]);
				continue;
			}
			const size = match.from.split(" ").length;
			const span = words.slice(i, i + size);
			corrected.push({
				text: match.to + span.map((word) => word.text).join(" ").slice(match.from.length),
				start: span[0].start,
				end: span[span.length - 1].end,
			});
			changed = true;
			i += size;
		}
		if (!changed) return segment;
		return {
			...segment,
			text: corrected.map((word) => word.text).join(" "),
			...(segment.words ? { words: corrected } : {}),
		};
	});
}

/** 단어 시각이 없는 구간은 띄어쓰기로 나눠 구간 시각을 같이 쓴다 */
function wordsOf({ segment }: { segment: TranscriptionSegment }): TranscriptionWord[] {
	if (segment.words?.length) return segment.words;
	return segment.text
		.split(/\s+/)
		.filter(Boolean)
		.map((text) => ({ text, start: segment.start, end: segment.end }));
}

/** 같은 바꿈은 횟수를 더해 하나로 합친다. 되돌린 바꿈은 지운다 */
export function mergeCorrections({
	corrections,
	learned,
	count = 1,
}: {
	corrections: readonly Correction[];
	learned: readonly { from: string; to: string }[];
	count?: number;
}): Correction[] {
	let merged = corrections.map((correction) => ({ ...correction }));
	for (const pair of learned) {
		// 고친 걸 되돌린 것이면 반대 바꿈을 배우지 않고 원래 바꿈을 지운다
		if (merged.some((correction) => correction.from === pair.to && correction.to === pair.from)) {
			merged = merged.filter((correction) => correction.from !== pair.to);
			continue;
		}
		const existing = merged.find((correction) => correction.from === pair.from);
		if (existing && existing.to === pair.to) existing.count += count;
		// 같은 말을 다르게 고쳤으면 새로 고친 쪽을 믿는다
		else if (existing) Object.assign(existing, { to: pair.to, count });
		else merged.push({ ...pair, count });
	}
	return merged;
}
