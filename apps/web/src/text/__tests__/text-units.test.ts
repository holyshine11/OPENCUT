import { describe, expect, test } from "bun:test";
import { mediaTimeFromSeconds, type TextAnimation } from "@/wasm";
import type { TextCanvasContext } from "../layout";
import type { MeasuredTextLayout } from "../primitives";
import { resolveTextUnits, usesUnitDrawing } from "../text-animation";
import { buildTextUnits } from "../text-units";

const CHAR_WIDTH = 10;
const KERNING = 3;

/** 글자마다 10px, "AV" 쌍은 3px 당겨지는 측정기. 폰트가 바뀌면 폭이 두 배가 된다 */
function fakeContext(): TextCanvasContext {
	const state = { font: "a" };
	return {
		save() {},
		restore() {},
		get font() {
			return state.font;
		},
		set font(value: string) {
			state.font = value;
		},
		measureText(text: string) {
			const scale = state.font === "big" ? 2 : 1;
			const chars = [...new Intl.Segmenter().segment(text)].length;
			const pairs = text.split("AV").length - 1;
			return { width: (chars * CHAR_WIDTH - pairs * KERNING) * scale } as TextMetrics;
		},
	} as unknown as TextCanvasContext;
}

function layout(lines: string[], fontString = "a"): MeasuredTextLayout {
	return {
		lines,
		fontString,
		letterSpacing: 0,
		lineHeightPx: 40,
	} as MeasuredTextLayout;
}

describe("buildTextUnits", () => {
	test("한글, 이모지, 결합 문자는 깨지지 않는다. 공백도 밑줄이 이어지도록 조각으로 둔다", () => {
		const { units } = buildTextUnits({
			layout: layout(["국밥 👍🏽é"]),
			ctx: fakeContext(),
		});
		expect(units.map((unit) => unit.text)).toEqual(["국", "밥", " ", "👍🏽", "é"]);
		expect(units.map((unit) => unit.x)).toEqual([0, 10, 20, 30, 40]);
	});

	test("커닝 쌍은 앞 글자와의 간격만큼 당겨진다", () => {
		const { units } = buildTextUnits({ layout: layout(["AVA"]), ctx: fakeContext() });
		expect(units.map((unit) => unit.x)).toEqual([0, 7, 17]);
	});

	test("단어와 줄 번호는 빈틈없이 매긴다", () => {
		const { units, wordOf, lineOf } = buildTextUnits({
			layout: layout(["오늘 국밥", "", "최고!"]),
			ctx: fakeContext(),
		});
		expect(units.map((unit) => unit.line)).toEqual([0, 0, 0, 0, 0, 2, 2, 2]);
		// 공백과 문장부호는 앞 단어에 붙는다
		expect(wordOf).toEqual([0, 0, 0, 1, 1, 2, 2, 2]);
		expect(lineOf).toEqual([0, 0, 0, 0, 0, 1, 1, 1]);
	});

	test("글자가 이어지는 문자의 줄은 줄째로 한 조각이다", () => {
		const { units } = buildTextUnits({ layout: layout(["سلام", "AB"]), ctx: fakeContext() });
		expect(units.map((unit) => unit.text)).toEqual(["سلام", "A", "B"]);
	});

	test("같은 줄이라도 폰트가 다르면 다시 잰다", () => {
		const ctx = fakeContext();
		buildTextUnits({ layout: layout(["AB"]), ctx });
		const big = buildTextUnits({ layout: layout(["AB"], "big"), ctx });
		expect(big.units.map((unit) => unit.x)).toEqual([0, 20]);
	});
});

describe("resolveTextUnits", () => {
	const ticks = (seconds: number) => mediaTimeFromSeconds({ seconds });
	const typewriter: TextAnimation = { in: { type: "typewriter", duration: 1 } };

	test("블록 프리셋만 있으면 줄 단위로 그린다", () => {
		expect(usesUnitDrawing({ in: { type: "fade", duration: 0.5 } })).toBe(false);
		expect(usesUnitDrawing(typewriter)).toBe(true);
		expect(
			usesUnitDrawing({ in: null, loop: { type: "letterWave", period: 1 } } as unknown as TextAnimation),
		).toBe(true);
		expect(
			resolveTextUnits({
				animation: { in: { type: "fade", duration: 0.5 } },
				localTime: ticks(0.1),
				duration: ticks(3),
				layout: layout(["AB"]),
				ctx: fakeContext(),
			}),
		).toBeUndefined();
	});

	test("타자기는 앞 글자부터 나타나고 끝난 뒤에도 조각 단위로 그린다", () => {
		const at = (seconds: number) =>
			resolveTextUnits({
				animation: typewriter,
				localTime: ticks(seconds),
				duration: ticks(3),
				layout: layout(["국밥최고"]),
				ctx: fakeContext(),
			})?.map((unit) => unit.opacity);
		expect(at(0.3)).toEqual([1, 1, 0, 0]);
		expect(at(2)).toEqual([1, 1, 1, 1]);
	});

	test("이동량은 줄 높이 px로 바뀐다", () => {
		const units = resolveTextUnits({
			animation: { in: { type: "lineRise", duration: 1 } },
			localTime: ticks(0),
			duration: ticks(3),
			layout: layout(["AB"]),
			ctx: fakeContext(),
		});
		// 줄씩 올라오기는 줄 높이의 0.6배 아래에서 시작한다
		expect(units?.[0].dy).toBeCloseTo(24, 6);
	});
});
