import { describe, expect, test } from "bun:test";
import {
	getTrackColor,
	prefersDarkText,
	resolveTimelineElementColor,
	TIMELINE_COLOR_PALETTE,
	TIMELINE_TRACK_THEME,
} from "@/timeline/components/theme";

describe("resolveTimelineElementColor", () => {
	test("클립 색이 트랙 색보다 앞선다", () => {
		expect(
			resolveTimelineElementColor({
				element: { color: "#111111" },
				track: { type: "text", color: "#222222" },
			}),
		).toBe("#111111");
	});

	test("클립 색이 없으면 트랙 색을 따른다", () => {
		expect(
			resolveTimelineElementColor({
				element: {},
				track: { type: "text", color: "#222222" },
			}),
		).toBe("#222222");
	});

	test("둘 다 없으면 트랙 종류 기본색, 영상은 색 없음", () => {
		expect(
			resolveTimelineElementColor({ element: {}, track: { type: "audio" } }),
		).toBe(TIMELINE_TRACK_THEME.audio.color);
		expect(getTrackColor({ track: { type: "video" } })).toBeUndefined();
	});
});

describe("prefersDarkText", () => {
	test("밝은 배경만 검은 글자", () => {
		expect(prefersDarkText({ color: "#FFFFFF" })).toBe(true);
		expect(prefersDarkText({ color: "#000000" })).toBe(false);
	});

	test("트랙 종류 기본색은 지금처럼 흰 글자", () => {
		for (const { color } of Object.values(TIMELINE_TRACK_THEME)) {
			if (color) expect(prefersDarkText({ color })).toBe(false);
		}
	});

	test("프리셋은 겹치지 않는 16색", () => {
		expect(new Set(TIMELINE_COLOR_PALETTE).size).toBe(16);
	});
});
