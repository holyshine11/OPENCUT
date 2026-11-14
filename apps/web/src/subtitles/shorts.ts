import { type ChapterCue, timestamp } from "./chapters";
import settings from "./shorts.json";

export type ShortsSettings = typeof settings;
export interface ShortCandidate {
	start: number;
	end: number;
	text: string;
	score: number;
}

interface Sentence {
	start: number;
	end: number;
	text: string;
}

/**
 * 롱폼 자막에서 쇼츠로 뗄 만한 `minSeconds`~`maxSeconds`초 구간을 고른다(youtube-agent-skill yt-shorts 기준, MIT).
 * - 문장 처음에서 시작하고 문장 끝에서 끝난다. "그래서·이렇게"처럼 앞 이야기를 받는 말로 시작하면 뺀다
 * - 반전 말("그런데 말입니다", "오늘의 킥")이 있으면, 특히 첫 문장에 있으면 점수를 더 준다
 * 겹치지 않게 점수 순으로 `minScore` 이상 최대 `count`개. 사람이 보고 고르는 후보다
 */
export function proposeShorts({
	cues,
	options = settings,
}: {
	cues: readonly ChapterCue[];
	options?: ShortsSettings;
}): ShortCandidate[] {
	const sentences = toSentences({ cues });
	const candidates: ShortCandidate[] = [];
	sentences.forEach((first, i) => {
		const opener = first.text.split(/[\s,.]+/)[0] ?? "";
		// "그리고 오늘의 킥이…"처럼 받는 말 뒤에 반전 말이 오면 새 이야기의 시작이다
		if (options.openers.includes(opener) && !isHook({ sentence: first, options })) return;
		for (let j = i; j < sentences.length && sentences[j].end - first.start <= options.maxSeconds; j++) {
			if (sentences[j].end - first.start < options.minSeconds) continue;
			const span = sentences.slice(i, j + 1);
			const text = span.map((s) => s.text).join(" ");
			candidates.push({ start: first.start, end: sentences[j].end, text, score: score({ span, text, options }) });
		}
	});

	const picked: ShortCandidate[] = [];
	for (const candidate of candidates.sort((a, b) => b.score - a.score || a.end - a.start - (b.end - b.start))) {
		// 5개를 억지로 채우지 않는다. 반전 말도 질문도 없는 재료 나열은 뺀다
		if (picked.length >= options.count || candidate.score < options.minScore) break;
		if (picked.every((p) => candidate.end <= p.start || candidate.start >= p.end)) picked.push(candidate);
	}
	return picked.sort((a, b) => a.start - b.start);
}

/** 후보마다 "시작-끝" 한 줄과 대사. 클립보드에 넣어 확인하거나 /yt-shorts에 붙인다 */
export function formatShorts({ shorts }: { shorts: readonly ShortCandidate[] }): string {
	return shorts.map((s) => `${timestamp({ seconds: s.start })}-${timestamp({ seconds: s.end })}\n${s.text}`).join("\n\n");
}

function score({ span, text, options }: { span: readonly Sentence[]; text: string; options: ShortsSettings }): number {
	const turns = options.turns.filter((word) => text.includes(word)).length;
	return (
		Math.min(turns, options.maxTurns) * options.turnWeight +
		(isHook({ sentence: span[0], options }) ? options.hookWeight : 0) +
		(text.includes("?") ? options.questionWeight : 0) +
		(/\d/.test(text) ? options.numberWeight : 0)
	);
}

const isHook = ({ sentence, options }: { sentence: Sentence; options: ShortsSettings }) =>
	sentence.text.includes("?") || options.turns.some((word) => sentence.text.includes(word));

/** 자막 큐는 문장 중간에서 끊기므로 문장 단위로 다시 묶는다. 큐 안의 시간은 글자 수에 비례해 나눈다 */
function toSentences({ cues }: { cues: readonly ChapterCue[] }): Sentence[] {
	// 자동 자막처럼 문장부호가 아예 없으면 전체가 한 문장이 되므로 자막 하나를 문장 하나로 본다
	if (!cues.some((cue) => SENTENCE_END.test(cue.text)))
		return cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text.replace(/\s+/g, " ").trim() }));
	const sentences: Sentence[] = [];
	let current: Sentence | null = null;
	for (const cue of cues) {
		const text = cue.text.replace(/\s+/g, " ").trim();
		// "1.5큰술"처럼 숫자 사이 점은 문장 끝이 아니다
		const pieces = text.match(/(?:[^.?!…]|\.(?=\d))+(?:[?!…]|\.(?!\d))+["']?|(?:[^.?!…]|\.(?=\d))+$/gu) ?? [];
		let offset = 0;
		for (const piece of pieces) {
			const at = (chars: number) => cue.start + ((cue.end - cue.start) * chars) / Math.max(1, text.length);
			const start = at(text.indexOf(piece, offset));
			offset = text.indexOf(piece, offset) + piece.length;
			const end = at(offset);
			if (current) {
				current.text = `${current.text} ${piece.trim()}`;
				current.end = end;
			} else current = { start, end, text: piece.trim() };
			if (/[.?!…]["']?$/u.test(piece.trim())) {
				sentences.push(current);
				current = null;
			}
		}
	}
	if (current) sentences.push(current);
	return sentences;
}

const SENTENCE_END = /[?!…]|\.(?!\d)/u;
