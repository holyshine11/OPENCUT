import { describe, expect, test } from "bun:test";
import type { SceneTracks, TextElement, TextTrack } from "@/timeline";
// 테스트 런타임에서 wasm을 불러올 수 없어 MediaTime은 타입만 쓴다
import type { MediaTime } from "@/wasm";
import {
	buildGroupUpdates,
	buildUngroupUpdates,
	expandToGroups,
} from "../clip-groups";

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 정수 tick 값만 넘긴다
const ticks = (value: number) => value as MediaTime;

function textElement({
	id,
	groupId,
}: {
	id: string;
	groupId?: string;
}): TextElement {
	return {
		id,
		type: "text",
		name: id,
		startTime: ticks(0),
		duration: ticks(10),
		trimStart: ticks(0),
		trimEnd: ticks(0),
		params: { content: id },
		groupId,
	};
}

function textTrack({
	id,
	elements,
}: {
	id: string;
	elements: TextElement[];
}): TextTrack {
	return { id, type: "text", name: id, hidden: false, elements };
}

const tracks: SceneTracks = {
	overlay: [
		textTrack({
			id: "t1",
			elements: [
				textElement({ id: "a", groupId: "g1" }),
				textElement({ id: "solo" }),
			],
		}),
		textTrack({
			id: "t2",
			elements: [
				textElement({ id: "b", groupId: "g1" }),
				textElement({ id: "c", groupId: "g2" }),
				textElement({ id: "d", groupId: "g2" }),
			],
		}),
	],
	main: {
		id: "main",
		type: "video",
		name: "Main",
		muted: false,
		hidden: false,
		elements: [],
	},
	audio: [],
};

// "트랙/클립" 형태로 ElementRef를 만든다
const ref = (key: string) => {
	const [trackId, elementId] = key.split("/");
	return { trackId, elementId };
};

describe("expandToGroups", () => {
	test("다른 트랙에 있는 같은 그룹 클립까지 더한다", () => {
		expect(expandToGroups({ tracks, elements: [ref("t1/a")] })).toEqual([
			ref("t1/a"),
			ref("t2/b"),
		]);
	});

	test("그룹이 없는 클립은 그대로 둔다", () => {
		expect(expandToGroups({ tracks, elements: [ref("t1/solo")] })).toEqual([
			ref("t1/solo"),
		]);
	});
});

describe("buildGroupUpdates", () => {
	test("클립이 하나뿐이면 묶지 않는다", () => {
		expect(
			buildGroupUpdates({
				tracks,
				elements: [ref("t1/solo")],
				groupId: "new",
			}),
		).toEqual([]);
	});

	test("이미 그룹에 든 클립은 그 그룹째 새 그룹으로 묶는다", () => {
		const updates = buildGroupUpdates({
			tracks,
			elements: [ref("t1/solo"), ref("t2/c")],
			groupId: "new",
		});
		expect(updates.map((u) => u.elementId)).toEqual(["solo", "c", "d"]);
		expect(updates.every((u) => u.patch.groupId === "new")).toBe(true);
	});
});

describe("buildUngroupUpdates", () => {
	test("고른 클립이 속한 그룹 전체의 groupId를 지운다", () => {
		const updates = buildUngroupUpdates({
			tracks,
			elements: [ref("t1/a"), ref("t1/solo")],
		});
		expect(updates).toEqual([
			{ ...ref("t1/a"), patch: { groupId: undefined } },
			{ ...ref("t2/b"), patch: { groupId: undefined } },
		]);
	});
});
