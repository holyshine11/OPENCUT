import { describe, expect, test } from "bun:test";
import type { EffectElement, EffectTrack, SceneTracks } from "@/timeline";
import { redirectOverlappingCopies } from "@/timeline/group-move/copy-overlap";
import type { GroupMoveResult } from "@/timeline/group-move";
// 테스트 런타임에서 wasm을 불러올 수 없어 MediaTime은 타입만 쓴다
import type { MediaTime } from "@/wasm";

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 정수 tick 값만 넘긴다
const ticks = (value: number) => value as MediaTime;

const effectTrack = ({
	id,
	elements,
}: {
	id: string;
	elements: EffectElement[];
}): EffectTrack => ({
	id,
	name: id,
	type: "effect",
	elements,
	hidden: false,
});

const layer = ({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): EffectElement => ({
	id,
	name: id,
	type: "effect",
	effectType: "adjust",
	params: {},
	startTime: ticks(startTime),
	duration: ticks(duration),
	trimStart: ticks(0),
	trimEnd: ticks(0),
});

const tracks: SceneTracks = [
	effectTrack({ id: "top", elements: [] }),
	effectTrack({
		id: "fx",
		elements: [layer({ id: "adjust", startTime: 0, duration: 1000 })],
	}),
];

const moveTo = ({
	newStartTime,
}: {
	newStartTime: number;
}): GroupMoveResult => ({
	moves: [
		{
			sourceTrackId: "fx",
			targetTrackId: "fx",
			elementId: "adjust",
			newStartTime: ticks(newStartTime),
		},
	],
	createTracks: [],
	targetSelection: [{ trackId: "fx", elementId: "adjust" }],
});

describe("redirectOverlappingCopies", () => {
	test("겹치는 복사본은 원본 트랙 바로 위 새 트랙으로 간다", () => {
		const plan = redirectOverlappingCopies({
			tracks,
			result: moveTo({ newStartTime: 200 }),
			createTrackId: () => "new",
		});
		expect(plan?.createTracks).toEqual([
			{ id: "new", type: "effect", index: 1 },
		]);
		expect(plan?.moves[0]?.targetTrackId).toBe("new");
		expect(plan?.targetSelection[0]?.trackId).toBe("new");
	});

	test("겹치지 않으면 계획을 그대로 쓴다", () => {
		const result = moveTo({ newStartTime: 1000 });
		expect(
			redirectOverlappingCopies({ tracks, result, createTrackId: () => "new" }),
		).toBe(result);
	});

	test("이미 새 트랙을 만드는 이동과 겹치면 복사하지 않는다", () => {
		const result = {
			...moveTo({ newStartTime: 200 }),
			createTracks: [{ id: "planned", type: "video" as const, index: 0 }],
		};
		expect(
			redirectOverlappingCopies({ tracks, result, createTrackId: () => "new" }),
		).toBeNull();
	});
});
