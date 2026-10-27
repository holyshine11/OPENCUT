import { describe, expect, test } from "bun:test";
import {
	getAlignDelta,
	getDistributeDeltas,
	getMarginFrame,
	getSelectionFrame,
} from "../align-clips";

const getCanvasAlignDelta = ({
	bounds,
	canvasSize,
	margins,
	align,
}: {
	bounds: Parameters<typeof getAlignDelta>[0]["bounds"];
	canvasSize: { width: number; height: number };
	margins: Parameters<typeof getMarginFrame>[0]["margins"];
	align: Parameters<typeof getAlignDelta>[0]["align"];
}) => getAlignDelta({ bounds, frame: getMarginFrame({ canvasSize, margins }), align });

const canvasSize = { width: 1920, height: 1080 };
const bounds = { cx: 500, cy: 300, width: 200, height: 100, rotation: 0 };
const noMargins = { top: 0, right: 0, bottom: 0, left: 0 };
const margins = { top: 10, right: 20, bottom: 30, left: 40 };

describe("캔버스 정렬", () => {
	test("여백 없이 왼쪽·오른쪽·가운데", () => {
		expect(getCanvasAlignDelta({ bounds, canvasSize, margins: noMargins, align: "left" })).toEqual({ x: -400, y: 0 });
		expect(getCanvasAlignDelta({ bounds, canvasSize, margins: noMargins, align: "right" })).toEqual({ x: 1320, y: 0 });
		expect(getCanvasAlignDelta({ bounds, canvasSize, margins: noMargins, align: "centerX" })).toEqual({ x: 460, y: 0 });
	});
	test("여백만큼 안쪽에 붙는다", () => {
		expect(getCanvasAlignDelta({ bounds, canvasSize, margins, align: "left" })).toEqual({ x: -360, y: 0 });
		expect(getCanvasAlignDelta({ bounds, canvasSize, margins, align: "right" })).toEqual({ x: 1300, y: 0 });
		expect(getCanvasAlignDelta({ bounds, canvasSize, margins, align: "centerX" })).toEqual({ x: 470, y: 0 });
		expect(getCanvasAlignDelta({ bounds, canvasSize, margins, align: "top" })).toEqual({ x: 0, y: -240 });
		expect(getCanvasAlignDelta({ bounds, canvasSize, margins, align: "bottom" })).toEqual({ x: 0, y: 700 });
		expect(getCanvasAlignDelta({ bounds, canvasSize, margins, align: "centerY" })).toEqual({ x: 0, y: 230 });
	});
});

describe("선택 기준 정렬", () => {
	test("고른 요소 전체 상자의 왼쪽·아래에 맞춘다", () => {
		const a = { cx: 100, cy: 100, width: 100, height: 40, rotation: 0 }; // 50~150, 80~120
		const b = { cx: 400, cy: 300, width: 200, height: 60, rotation: 0 }; // 300~500, 270~330
		const frame = getSelectionFrame({ bounds: [a, b] });
		expect(frame).toEqual({ left: 50, top: 80, right: 500, bottom: 330 });
		expect(getAlignDelta({ bounds: b, frame, align: "left" })).toEqual({ x: -250, y: 0 });
		expect(getAlignDelta({ bounds: a, frame, align: "left" })).toEqual({ x: 0, y: 0 });
		expect(getAlignDelta({ bounds: a, frame, align: "bottom" })).toEqual({ x: 0, y: 210 });
		expect(getAlignDelta({ bounds: a, frame, align: "centerX" })).toEqual({ x: 175, y: 0 });
	});
});

describe("간격 분포", () => {
	const box = (cy: number, height: number) => ({ cx: 0, cy, width: 100, height, rotation: 0 });

	test("맨 위 상자는 두고 아래로 gap 만큼 띄운다 (입력 순서 유지)", () => {
		// 위쪽 끝: 300, 0, 100
		const boxes = [box(320, 40), box(10, 20), box(150, 100)];
		const deltas = getDistributeDeltas({ bounds: boxes, axis: "vertical", gap: 5 });
		// 0~20 → 25~125 → 130~170
		expect(deltas).toEqual([
			{ x: 0, y: 150 - 320 },
			{ x: 0, y: 0 },
			{ x: 0, y: 75 - 150 },
		]);
	});
	test("가로 분포는 x 만 옮긴다", () => {
		const boxes = [
			{ cx: 50, cy: 0, width: 100, height: 10, rotation: 0 },
			{ cx: 400, cy: 0, width: 50, height: 10, rotation: 0 },
		];
		expect(getDistributeDeltas({ bounds: boxes, axis: "horizontal", gap: 10 })).toEqual([
			{ x: 0, y: 0 },
			{ x: 135 - 400, y: 0 },
		]);
	});
});
