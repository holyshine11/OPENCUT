import type { TextCanvasContext } from "./layout";
import { setCanvasLetterSpacing } from "./layout";
import type { MeasuredTextLayout } from "./primitives";

/** 유닛 애니메이션에서 따로 그리는 한 조각. x는 줄 왼쪽 끝에서 이 조각 왼쪽까지(px) */
export interface TextDrawUnit {
	text: string;
	line: number;
	x: number;
	width: number;
}

/** 그 시점의 유닛 애니메이션이 적용된 조각. dx/dy는 px, rotate는 도, 중심은 조각 가운데 */
export interface ResolvedTextUnit extends TextDrawUnit {
	dx: number;
	dy: number;
	scale: number;
	rotate: number;
	opacity: number;
}

interface LineUnits {
	units: { text: string; x: number; width: number; word: number }[];
	wordCount: number;
}

// 글자가 서로 이어지거나 모양이 바뀌는 문자(아랍, 히브리, 인도계, 동남아 문자 등). 이런 줄은 줄째로 그린다
const JOINING_SCRIPT =
	/[֐-ࣿऀ-෿฀-࿿က-႟ក-៿יִ-﷿ﹰ-﻿]/;

// 줄 텍스트와 폰트별 앞부분 폭. 유닛 배열이 아니라 측정값만 담아 글자/단어 프리셋이 같은 값을 쓴다
const lineCache = new Map<string, LineUnits>();
// ponytail: 크기만 넘치면 통째로 비운다. 긴 자막 프로젝트에서 측정이 잦아지면 LRU로 바꾼다
const LINE_CACHE_LIMIT = 2000;

globalThis.document?.fonts?.addEventListener("loadingdone", () => lineCache.clear());

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const words = new Intl.Segmenter(undefined, { granularity: "word" });

function measureLine({
	ctx,
	line,
	cacheKey,
}: {
	ctx: TextCanvasContext;
	line: string;
	cacheKey: string;
}): LineUnits {
	const cached = lineCache.get(cacheKey);
	if (cached) return cached;

	// 글자마다 단어 번호. 단어가 아닌 조각(공백, 문장부호)은 앞 단어에 붙인다
	const wordAt: number[] = new Array(line.length).fill(0);
	let word = -1;
	for (const segment of words.segment(line)) {
		if (segment.isWordLike || word < 0) word += 1;
		wordAt.fill(word, segment.index, segment.index + segment.segment.length);
	}

	const units: LineUnits["units"] = [];
	if (JOINING_SCRIPT.test(line)) {
		units.push({ text: line, x: 0, width: ctx.measureText(line).width, word: 0 });
	} else {
		for (const { segment, index } of graphemes.segment(line)) {
			const width = ctx.measureText(segment).width;
			// 앞 글자와의 커닝과 자간이 들어가도록 (앞부분 + 이 글자) 폭에서 이 글자 폭을 뺀다
			const end = ctx.measureText(line.slice(0, index + segment.length)).width;
			units.push({ text: segment, x: end - width, width, word: wordAt[index] });
		}
	}

	const result = { units, wordCount: Math.max(1, word + 1) };
	if (lineCache.size >= LINE_CACHE_LIMIT) lineCache.clear();
	lineCache.set(cacheKey, result);
	return result;
}

/** 측정된 줄들을 그리는 조각으로 나누고, 조각마다 몇 번째 단어/줄인지 함께 돌려준다 */
export function buildTextUnits({
	layout,
	ctx,
}: {
	layout: MeasuredTextLayout;
	ctx: TextCanvasContext;
}): { units: TextDrawUnit[]; wordOf: number[]; lineOf: number[] } {
	const units: TextDrawUnit[] = [];
	const wordOf: number[] = [];
	const lineOf: number[] = [];
	ctx.save();
	ctx.font = layout.fontString;
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });
	let wordOffset = 0;
	layout.lines.forEach((line, lineIndex) => {
		const measured = measureLine({
			ctx,
			line,
			cacheKey: `${layout.fontString}|${layout.letterSpacing}|${line}`,
		});
		for (const unit of measured.units) {
			units.push({ text: unit.text, line: lineIndex, x: unit.x, width: unit.width });
			wordOf.push(wordOffset + unit.word);
			lineOf.push(lineIndex);
		}
		wordOffset += measured.wordCount;
	});
	ctx.restore();
	// 빈 줄은 조각이 없으니 번호를 당겨 빈 차례가 생기지 않게 한다
	return { units, wordOf: denseRanks(wordOf), lineOf: denseRanks(lineOf) };
}

/** 줄어들지 않는 번호 배열을 0부터 빈틈없는 번호로 바꾼다 */
function denseRanks(values: number[]): number[] {
	const ranks = new Map<number, number>();
	return values.map((value) => {
		if (!ranks.has(value)) ranks.set(value, ranks.size);
		return ranks.get(value) as number;
	});
}
