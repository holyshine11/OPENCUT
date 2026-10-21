// 문장 끝(. ? ! …)까지를 한 문장으로 본다. 숫자 사이 마침표(0.5큰술)는 문장 끝이 아니다.
// 끝 문장부호 뒤에 붙은 닫는 따옴표·괄호는 앞 문장에 남긴다
const SENTENCE_PATTERN = /.+?(?:[.?!…]+(?!\d)["'”’)\]]*|$)/gu;
const HAS_WORD = /[\p{L}\p{N}]/u;

/**
 * 대본을 합성할 문장으로 나눈다. 줄바꿈도 문장 경계다. 문장부호는 남기고, 글자 없는 조각은 버린다.
 * maxChars보다 긴 문장은 쉼표에서 한 번 더 나눈다. 쉼표가 없으면 그대로 둔다
 */
export function splitSentences({
	text,
	maxChars,
}: {
	text: string;
	maxChars: number;
}): string[] {
	return text
		.split(/\r?\n/)
		.flatMap((line) => line.match(SENTENCE_PATTERN) ?? [])
		.map((sentence) => sentence.trim())
		.filter((sentence) => HAS_WORD.test(sentence))
		.flatMap((sentence) => splitAtCommas({ sentence, maxChars }));
}

/** 쉼표 뒤에서 나눈 조각을 maxChars를 넘지 않게 앞에서부터 다시 붙인다 */
function splitAtCommas({
	sentence,
	maxChars,
}: {
	sentence: string;
	maxChars: number;
}): string[] {
	if (sentence.length <= maxChars) return [sentence];

	const parts = sentence.split(/(?<=,)(?!\d)\s*/);
	const pieces: string[] = [];
	for (const part of parts) {
		const last = pieces.at(-1);
		if (last !== undefined && last.length + 1 + part.length <= maxChars) {
			pieces[pieces.length - 1] = `${last} ${part}`;
		} else {
			pieces.push(part);
		}
	}
	return pieces.filter((piece) => HAS_WORD.test(piece));
}

/** 다음 음성 파일 번호. 프로젝트에 이미 있는 `tts-<목소리>-<번호>.*` 중 가장 큰 번호 다음부터 잇는다 */
export function nextTtsFileNumber({ names, voice }: { names: string[]; voice: string }): number {
	const prefix = `tts-${voice}-`;
	let max = 0;
	for (const name of names) {
		if (!name.startsWith(prefix)) continue;
		const number = Number.parseInt(name.slice(prefix.length), 10);
		if (number > max) max = number;
	}
	return max + 1;
}
