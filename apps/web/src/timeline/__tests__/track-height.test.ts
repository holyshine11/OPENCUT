import { describe, expect, test } from "bun:test";
import {
	TIMELINE_TRACK_HEIGHT_RANGE_PX,
	TIMELINE_TRACK_HEIGHTS_PX,
} from "@/timeline/components/layout";
import {
	clampTrackHeight,
	getTrackRowLayouts,
} from "@/timeline/components/track-layout";

describe("트랙 높이", () => {
	test("바꾼 높이가 있으면 기본 높이 대신 줄 배치에 쓴다", () => {
		const { rows } = getTrackRowLayouts({
			tracks: [{ type: "video", height: 120 }, { type: "audio" }],
		});
		expect(rows[0].height).toBe(120);
		expect(rows[1].height).toBe(TIMELINE_TRACK_HEIGHTS_PX.audio);
	});

	test("범위 밖 높이는 범위 끝으로 자른다", () => {
		expect(clampTrackHeight(1)).toBe(TIMELINE_TRACK_HEIGHT_RANGE_PX.min);
		expect(clampTrackHeight(10_000)).toBe(TIMELINE_TRACK_HEIGHT_RANGE_PX.max);
	});
});
