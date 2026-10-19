/** 자막 목록에서 쓰는 시간 계산. 시간은 모두 초 단위다 */
export interface Cue {
	text: string;
	start: number;
	end: number;
	/** 단어마다 시작한 시각. 문구를 고쳐 단어 수가 달라지면 쓰지 않는다 */
	wordStarts?: number[];
}

const visibleLength = (text: string) => text.replace(/\s/g, "").length;
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

function usableWordStarts({ cue }: { cue: Cue }): number[] | undefined {
	return cue.wordStarts?.length === wordsOf(cue.text).length
		? cue.wordStarts
		: undefined;
}

/** 단어 사이에서 나눌 때 뒤 단어가 시작한 시각. 쓸 수 없으면 null */
function wordSplit({
	cue,
	before,
	after,
}: {
	cue: Cue;
	before: string;
	after: string;
}): { time: number; index: number } | null {
	const wordStarts = usableWordStarts({ cue });
	const index = wordsOf(before).length;
	if (!wordStarts || index + wordsOf(after).length !== wordStarts.length) {
		return null;
	}
	const time = wordStarts[index];
	return time > cue.start && time < cue.end ? { time, index } : null;
}

/**
 * 커서 위치(at, 글자 인덱스)에서 둘로 나눈다. 단어 사이를 나누고 단어 시간이 있으면
 * 뒤 단어가 시작한 때에서, 아니면 공백을 뺀 글자 수 비율로 시간을 나눈다
 */
export function splitCue({
	cue,
	at,
}: {
	cue: Cue;
	at: number;
}): [Cue, Cue] | null {
	const before = cue.text.slice(0, at).trim();
	const after = cue.text.slice(at).trim();
	if (!before || !after) return null;

	const byWord = wordSplit({ cue, before, after });
	if (byWord) {
		const { time, index } = byWord;
		return [
			{
				text: before,
				start: cue.start,
				end: time,
				wordStarts: cue.wordStarts?.slice(0, index),
			},
			{
				text: after,
				start: time,
				end: cue.end,
				wordStarts: cue.wordStarts?.slice(index),
			},
		];
	}

	const ratio =
		visibleLength(before) / (visibleLength(before) + visibleLength(after));
	const splitTime = cue.start + (cue.end - cue.start) * ratio;
	return [
		{ text: before, start: cue.start, end: splitTime },
		{ text: after, start: splitTime, end: cue.end },
	];
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
