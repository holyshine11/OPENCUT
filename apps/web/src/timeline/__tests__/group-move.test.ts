import { describe, expect, test } from "bun:test";
import type { AudioElement, AudioTrack, SceneTracks, TextElement, TextTrack } from "@/timeline";
import { buildMoveGroup, planNudge, resolveGroupMove } from "@/timeline/group-move";
import { mediaTime, ZERO_MEDIA_TIME } from "@/wasm";

const base = ({ id, start }: { id: string; start: number }) => ({
	id,
	name: id,
	startTime: mediaTime({ ticks: start }),
	duration: mediaTime({ ticks: 100 }),
	trimStart: ZERO_MEDIA_TIME,
	trimEnd: ZERO_MEDIA_TIME,
	params: {},
});
const text = ({ id, start }: { id: string; start: number }): TextElement => ({
	...base({ id, start }),
	type: "text",
});
const audio = ({ id, start }: { id: string; start: number }): AudioElement => ({
	...base({ id, start }),
	type: "audio",
	sourceType: "upload",
	mediaId: id,
});

const textTrack = ({ id, elements }: { id: string; elements: TextElement[] }): TextTrack => ({
	id,
	name: id,
	type: "text",
	elements,
	hidden: false,
});
const audioTrack = ({ id, elements }: { id: string; elements: AudioElement[] }): AudioTrack => ({
	id,
	name: id,
	type: "audio",
	elements,
	muted: false,
});

function moveHorizontally({
	tracks,
	anchor,
	selected,
	to,
}: {
	tracks: SceneTracks;
	anchor: { trackId: string; elementId: string };
	selected: { trackId: string; elementId: string }[];
	to: number;
}) {
	const group = buildMoveGroup({ anchorRef: anchor, selectedElements: selected, tracks });
	if (!group) throw new Error("no group");
	return resolveGroupMove({
		group,
		tracks,
		anchorStartTime: mediaTime({ ticks: to }),
		target: { kind: "existingTrack", anchorTargetTrackId: anchor.trackId },
	});
}

describe("resolveGroupMove", () => {
	test("다른 트랙의 두 클립을 좌우로만 옮기면 사이에 같은 종류 트랙이 있어도 각자 트랙에 남는다", () => {
		const tracks: SceneTracks = [
			textTrack({ id: "t0", elements: [text({ id: "a", start: 0 })] }),
			textTrack({ id: "t1", elements: [] }),
			audioTrack({ id: "a0", elements: [audio({ id: "b", start: 0 })] }),
		];
		const result = moveHorizontally({
			tracks,
			anchor: { trackId: "a0", elementId: "b" },
			selected: [
				{ trackId: "t0", elementId: "a" },
				{ trackId: "a0", elementId: "b" },
			],
			to: 500,
		});
		expect(
			result?.moves.map(({ elementId, targetTrackId, newStartTime }) => [
				elementId,
				targetTrackId,
				Number(newStartTime),
			]),
		).toEqual([
			["b", "a0", 500],
			["a", "t0", 500],
		]);
		expect(result?.createTracks).toEqual([]);
	});

	test("아래로 한 칸 옮기면 위 클립도 한 칸 내려간다", () => {
		const tracks: SceneTracks = [
			textTrack({ id: "t0", elements: [text({ id: "a", start: 0 })] }),
			textTrack({ id: "t1", elements: [text({ id: "b", start: 0 })] }),
			textTrack({ id: "t2", elements: [] }),
		];
		const group = buildMoveGroup({
			anchorRef: { trackId: "t1", elementId: "b" },
			selectedElements: [
				{ trackId: "t0", elementId: "a" },
				{ trackId: "t1", elementId: "b" },
			],
			tracks,
		});
		if (!group) throw new Error("no group");
		const result = resolveGroupMove({
			group,
			tracks,
			anchorStartTime: mediaTime({ ticks: 0 }),
			target: { kind: "existingTrack", anchorTargetTrackId: "t2" },
		});
		expect(result?.moves.map(({ elementId, targetTrackId }) => [elementId, targetTrackId])).toEqual([
			["b", "t2"],
			["a", "t1"],
		]);
	});
});

describe("planNudge", () => {
	const tracks: SceneTracks = [
		textTrack({ id: "t0", elements: [text({ id: "a", start: 0 }), text({ id: "wall", start: 300 })] }),
		textTrack({ id: "t1", elements: [] }),
		audioTrack({ id: "a0", elements: [audio({ id: "b", start: 50 })] }),
	];
	const selected = [
		{ trackId: "t0", elementId: "a" },
		{ trackId: "a0", elementId: "b" },
	];

	test("고른 클립을 모두 제 트랙에서 함께 옮긴다", () => {
		expect(
			planNudge({ tracks, selectedElements: selected, delta: 10 })?.map(
				({ elementId, targetTrackId, newStartTime }) => [elementId, targetTrackId, Number(newStartTime)],
			),
		).toEqual([
			["a", "t0", 10],
			["b", "a0", 60],
		]);
	});

	test("0초보다 앞이나 다른 클립과 겹치는 곳으로는 옮기지 않는다", () => {
		expect(planNudge({ tracks, selectedElements: selected, delta: -10 })).toBeNull();
		expect(planNudge({ tracks, selectedElements: selected, delta: 250 })).toBeNull();
	});
});
