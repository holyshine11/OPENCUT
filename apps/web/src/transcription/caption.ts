import type {
	CaptionChunk,
	CaptionLayout,
	TranscriptionSegment,
	TranscriptionWord,
} from "@/transcription/types";

export function buildCaptionChunks({
	segments,
	layout,
}: {
	segments: TranscriptionSegment[];
	layout: CaptionLayout;
}): CaptionChunk[] {
	// 단어 시간은 음성 인식이 실제로 준 것만 넘긴다. 글자 비율 추정값은 나눌 때 다시 계산된다
	const groups = segments.flatMap((segment) =>
		groupWords({ words: wordsOf({ segment }), layout }).map((lines) => ({
			lines,
			hasWordTimes: Boolean(segment.words?.length),
		})),
	);
	const captions: CaptionChunk[] = [];
	let previousEnd = 0;

	for (const [index, { lines, hasWordTimes }] of groups.entries()) {
		const first = lines[0][0];
		const last = lines[lines.length - 1].at(-1) ?? first;
		const startTime = Math.max(first.start, previousEnd);
		// 최소 표시 시간은 다음 자막이 시작하기 전까지만 채운다. 밀어내면 뒤 자막이 계속 늦어진다
		const nextStart = groups[index + 1]?.lines[0][0].start ?? Infinity;
		const endTime = Math.min(
			Math.max(last.end, Math.min(startTime + layout.minDuration, nextStart)),
			startTime + layout.maxDuration,
		);
		captions.push({
			text: lines.map((line) => line.map((word) => word.text).join(" ")).join("\n"),
			startTime,
			duration: endTime - startTime,
			wordStarts: hasWordTimes ? lines.flat().map((word) => word.start) : undefined,
		});
		previousEnd = endTime;
	}

	return captions;
}

/** 단어 시간 정보가 없으면 구간 시간을 글자 수 비율로 나눠 단어 시간을 만든다 */
function wordsOf({ segment }: { segment: TranscriptionSegment }): TranscriptionWord[] {
	if (segment.words?.length) return segment.words;

	const texts = segment.text.trim().split(/\s+/).filter(Boolean);
	const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
	const secondsPerChar = (segment.end - segment.start) / Math.max(totalChars, 1);
	let cursor = segment.start;
	return texts.map((text) => {
		const start = cursor;
		cursor += text.length * secondsPerChar;
		return { text, start, end: cursor };
	});
}

/**
 * 단어를 줄로, 줄을 자막으로 묶는다. 한 단어가 한 줄보다 길어도 단어 중간에서는 끊지 않는다.
 * 문장이 끝나면(. ? !) 자막도 끝낸다
 */
function groupWords({
	words,
	layout,
}: {
	words: TranscriptionWord[];
	layout: CaptionLayout;
}): TranscriptionWord[][][] {
	const captions: TranscriptionWord[][][] = [];
	let lines: TranscriptionWord[][] = [];
	let line: TranscriptionWord[] = [];
	let lineLength = 0;

	const flush = () => {
		if (line.length) lines.push(line);
		if (lines.length) captions.push(lines);
		lines = [];
		line = [];
		lineLength = 0;
	};

	for (const rawWord of words) {
		const text = layout.stripPunctuation ? rawWord.text.replace(/[.,]+$/, "") : rawWord.text;
		const endsSentence = /[.?!]$/.test(rawWord.text);
		const word = { ...rawWord, text };
		if (!word.text) {
			if (endsSentence) flush();
			continue;
		}
		const captionStart = (lines[0] ?? line)[0]?.start;
		if (captionStart !== undefined && word.end - captionStart > layout.maxDuration) {
			flush();
		}
		const nextLength = line.length ? lineLength + 1 + word.text.length : word.text.length;
		if (line.length && nextLength > layout.maxCharsPerLine) {
			lines.push(line);
			line = [];
			lineLength = 0;
			if (lines.length >= layout.maxLines) {
				captions.push(lines);
				lines = [];
			}
		}
		line.push(word);
		lineLength = line.length === 1 ? word.text.length : lineLength + 1 + word.text.length;
		if (endsSentence) flush();
	}
	flush();

	return captions;
}
