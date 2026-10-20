import { describe, expect, test } from "bun:test";
import {
	applyFadeCurve,
	type CrossfadeSpan,
	FADE_CURVES,
	fadeGainAt,
	resolveCrossfades,
	toFadeCurveId,
} from "../audio-fade";

const gain = ({
	fadeIn = 0,
	fadeOut = 0,
	at,
}: {
	fadeIn?: number;
	fadeOut?: number;
	at: number;
}) => fadeGainAt({ fadeIn, fadeOut, durationSeconds: 10, localTime: at });

describe("clip fade", () => {
	test("페이드가 없으면 게인 1", () => {
		expect(gain({ at: 0 })).toBe(1);
		expect(gain({ at: 10 })).toBe(1);
	});

	test("페이드 인은 0에서 시작해 끝에서 1이 된다", () => {
		expect(gain({ fadeIn: 2, at: 0 })).toBe(0);
		expect(gain({ fadeIn: 2, at: 5 })).toBe(1);
	});

	test("페이드 아웃은 클립 끝에서 0이 된다", () => {
		expect(gain({ fadeOut: 2, at: 8 })).toBe(1);
		expect(gain({ fadeOut: 2, at: 10 })).toBe(0);
	});

	test("겹치는 페이드는 두 곡선을 곱한다", () => {
		expect(gain({ fadeIn: 10, fadeOut: 10, at: 5 })).toBeCloseTo(0.25);
	});
});

describe("fade curve", () => {
	test("기본 곡선은 직선", () => {
		expect(gain({ fadeIn: 2, at: 1 })).toBeCloseTo(0.5);
	});

	test("모든 곡선은 0에서 0, 1에서 1", () => {
		for (const curve of Object.values(FADE_CURVES)) {
			expect(curve(0)).toBeCloseTo(0);
			expect(curve(1)).toBeCloseTo(1);
		}
		expect(applyFadeCurve({ curve: "linear", progress: 2 })).toBe(1);
	});

	test("모르는 곡선 값은 직선으로 읽는다", () => {
		expect(toFadeCurveId("nope")).toBe("linear");
		expect(toFadeCurveId("sCurve")).toBe("sCurve");
	});
});

const span = (patch: Partial<CrossfadeSpan> & { id: string }): CrossfadeSpan => ({
	start: 0,
	end: 10,
	handleBefore: 5,
	handleAfter: 5,
	crossfade: 0,
	...patch,
});

describe("crossfade", () => {
	test("맞붙은 경계를 가운데 두고 양쪽으로 반씩 늘린다", () => {
		const extents = resolveCrossfades({
			spans: [
				span({ id: "a", crossfade: 2 }),
				span({ id: "b", start: 10, end: 20 }),
			],
		});
		expect(extents.get("a")).toEqual({ before: 0, after: 1, fadeIn: 0, fadeOut: 2 });
		expect(extents.get("b")).toEqual({ before: 1, after: 0, fadeIn: 2, fadeOut: 0 });
	});

	test("한쪽 원본이 모자라면 다른 쪽으로 더 늘린다", () => {
		const extents = resolveCrossfades({
			spans: [
				span({ id: "a", crossfade: 2, handleAfter: 0 }),
				span({ id: "b", start: 10, end: 20 }),
			],
		});
		expect(extents.get("a")?.after).toBe(0);
		expect(extents.get("b")?.before).toBe(2);
	});

	test("떨어져 있거나 원본이 없으면 걸지 않는다", () => {
		expect(
			resolveCrossfades({
				spans: [
					span({ id: "a", crossfade: 2 }),
					span({ id: "b", start: 11, end: 20 }),
				],
			}).size,
		).toBe(0);
		expect(
			resolveCrossfades({
				spans: [
					span({ id: "a", crossfade: 2, handleAfter: 0 }),
					span({ id: "b", start: 10, end: 20, handleBefore: 0 }),
				],
			}).size,
		).toBe(0);
	});
});
