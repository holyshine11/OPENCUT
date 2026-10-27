import { describe, expect, test } from "bun:test";
import { buildTransformFromParams } from "@/rendering";
import {
	brushPathToCanvasStrokes,
	buildBrushParams,
	parseBrushPath,
	type BrushStroke,
} from "../definitions/brush";

describe("brush path", () => {
	test("round-trips draw and eraser strokes through the stored path and transform", () => {
		const strokes: BrushStroke[] = [
			[100, 200, 400, 250, 900, 700],
			{ erase: 24, p: [300, 220, 500, 400] },
			[1500, 100, 1500, 1000],
		];
		const params = buildBrushParams({ strokes, canvasWidth: 1920, canvasHeight: 1080 });
		const path = parseBrushPath(params.path);
		expect(path).not.toBeNull();
		const restored = brushPathToCanvasStrokes({
			path: path!,
			transform: buildTransformFromParams({ params }),
			canvasWidth: 1920,
			canvasHeight: 1080,
		});
		const flatten = (list: BrushStroke[]) =>
			list.flatMap((stroke) => (Array.isArray(stroke) ? stroke : [stroke.erase, ...stroke.p]));
		const expected = flatten(strokes);
		flatten(restored).forEach((value, i) => {
			expect(Math.abs(value - expected[i])).toBeLessThan(1);
		});
		expect(Array.isArray(restored[1])).toBe(false);
	});
});
