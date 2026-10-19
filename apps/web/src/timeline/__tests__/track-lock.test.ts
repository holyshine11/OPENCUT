import { describe, expect, test } from "bun:test";
import type { SceneTracks, TextTrack, VideoTrack } from "@/timeline";
import {
	excludeLockedElements,
	isTrackLocked,
} from "@/timeline/track-capabilities";
import { canPlaceTimeSpansOnTrack } from "@/timeline/placement/overlap";
import type { MediaTime } from "@/wasm";

// bun은 wasm을 불러오지 못해 MediaTime 값을 직접 만든다
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 정수 tick 값만 넘긴다
const ticks = (value: number) => value as MediaTime;

function textTrack({
	id,
	locked,
}: {
	id: string;
	locked?: boolean;
}): TextTrack {
	return { id, name: id, type: "text", elements: [], hidden: false, locked };
}

const main: VideoTrack = {
	id: "main",
	name: "main",
	type: "video",
	elements: [],
	muted: false,
	hidden: false,
};

const tracks: SceneTracks = {
	overlay: [
		textTrack({ id: "open" }),
		textTrack({ id: "locked", locked: true }),
	],
	main,
	audio: [],
};

describe("track lock", () => {
	test("locked가 true일 때만 잠긴 트랙", () => {
		expect(isTrackLocked({ locked: true })).toBe(true);
		expect(isTrackLocked({})).toBe(false);
		expect(isTrackLocked(null)).toBe(false);
	});

	test("잠긴 트랙의 클립만 걸러 낸다", () => {
		const elements = [
			{ trackId: "open", elementId: "a" },
			{ trackId: "locked", elementId: "b" },
			{ trackId: "main", elementId: "c" },
		];
		expect(
			excludeLockedElements({ tracks, elements }).map((ref) => ref.elementId),
		).toEqual(["a", "c"]);
	});

	test("잠긴 트랙에는 빈 자리여도 놓을 수 없다", () => {
		const timeSpans = [{ startTime: ticks(0), duration: ticks(1) }];
		expect(
			canPlaceTimeSpansOnTrack({ track: { elements: [] }, timeSpans }),
		).toBe(true);
		expect(
			canPlaceTimeSpansOnTrack({
				track: { elements: [], locked: true },
				timeSpans,
			}),
		).toBe(false);
	});
});
