import { describe, expect, test } from "bun:test";
import type { SceneTracks, TextElement, TextTrack } from "@/timeline";
// 테스트 런타임에서 wasm을 불러올 수 없어 MediaTime은 타입만 쓴다
import type { MediaTime } from "@/wasm";

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 정수 tick 값만 넘긴다
const ticks = (value: number) => value as MediaTime;
import { listSubtitleGroups } from "../groups";

function textElement({
	id,
	start,
	subtitleGroupId,
}: {
	id: string;
	start: number;
	subtitleGroupId?: string;
}): TextElement {
	return {
		id,
		type: "text",
		name: id,
		startTime: ticks(start),
		duration: ticks(10),
		trimStart: ticks(0),
		trimEnd: ticks(0),
		params: { content: id },
		subtitleGroupId,
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

function sceneTracks({ overlay }: { overlay: TextTrack[] }): SceneTracks {
	return {
		overlay,
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
}

describe("listSubtitleGroups", () => {
	test("자막 그룹 표시가 붙은 텍스트만 그룹별로 시작 시간순으로 모은다", () => {
		const tracks = sceneTracks({
			overlay: [
				textTrack({
					id: "t1",
					elements: [
						textElement({ id: "b", start: 20, subtitleGroupId: "g1" }),
						textElement({ id: "title", start: 0 }),
						textElement({ id: "a", start: 5, subtitleGroupId: "g1" }),
					],
				}),
				textTrack({
					id: "t2",
					elements: [
						textElement({ id: "c", start: 10, subtitleGroupId: "g1" }),
						textElement({ id: "x", start: 1, subtitleGroupId: "g2" }),
					],
				}),
			],
		});

		const groups = listSubtitleGroups({ tracks });

		expect(
			groups.map((group) => ({
				groupId: group.groupId,
				entries: group.entries.map((entry) => [
					entry.trackId,
					entry.element.id,
				]),
			})),
		).toEqual([
			{ groupId: "g2", entries: [["t2", "x"]] },
			{
				groupId: "g1",
				entries: [
					["t1", "a"],
					["t2", "c"],
					["t1", "b"],
				],
			},
		]);
	});
});
