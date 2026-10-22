import { describe, expect, test } from "bun:test";
import { getTextVisualRect, type TextCanvasContext } from "../layout";
import { drawMeasuredTextLayout, type MeasuredTextLayout } from "../primitives";

// 두 줄(100px, 60px). 정렬과 상관없이 글 덩어리는 요소 위치(0)를 가운데에 두고, 줄만 덩어리 안에서 붙는다
const block = { visualCenterOffset: 10, height: 40, maxWidth: 100 };
const background = { enabled: false, color: "transparent" };

function layoutOf(textAlign: MeasuredTextLayout["textAlign"]): MeasuredTextLayout {
	return {
		scaledFontSize: 20,
		fontString: "20px sans-serif",
		letterSpacing: 0,
		lineHeightPx: 20,
		fontSizeRatio: 1,
		textAlign,
		textDecoration: "none",
		lines: ["long line", "short"],
		lineMetrics: [{ width: 100 }, { width: 60 }] as TextMetrics[],
		block,
	};
}

/** 각 줄이 그려지는 [왼쪽, 오른쪽] 끝 */
function drawnLineSpans(textAlign: MeasuredTextLayout["textAlign"]): number[][] {
	const layout = layoutOf(textAlign);
	const spans: number[][] = [];
	const ctx = {
		fillText(text: string, x: number) {
			const width = layout.lineMetrics[layout.lines.indexOf(text)].width;
			const left = textAlign === "left" ? x : textAlign === "right" ? x - width : x - width / 2;
			spans.push([left, left + width]);
		},
	} as unknown as TextCanvasContext;
	drawMeasuredTextLayout({ ctx, layout, textColor: "#fff" });
	return spans;
}

describe("텍스트 정렬", () => {
	test("왼쪽 정렬은 덩어리 왼쪽 끝에 줄을 붙인다", () => {
		expect(drawnLineSpans("left")).toEqual([[-50, 50], [-50, 10]]);
	});

	test("오른쪽 정렬은 덩어리 오른쪽 끝에 줄을 붙인다", () => {
		expect(drawnLineSpans("right")).toEqual([[-50, 50], [-10, 50]]);
	});

	test("가운데 정렬은 그대로 가운데", () => {
		expect(drawnLineSpans("center")).toEqual([[-50, 50], [-30, 30]]);
	});

	test("선택 상자도 위치를 가운데에 둔다", () => {
		expect(getTextVisualRect({ block, background }).left).toBe(-50);
	});
});
