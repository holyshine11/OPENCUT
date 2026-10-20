import { describe, expect, test } from "bun:test";
import type { ElementTransition, TimelineElement } from "@/timeline";
import { type MediaTime, TICKS_PER_SECOND } from "@/wasm";
import { buildTransitionUpdates, resolveTransitionWindows } from "../index";

const S = TICKS_PER_SECOND;

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 정수 tick 값만 넘긴다
const ticks = (seconds: number) => Math.round(seconds * S) as MediaTime;

function clip({
	id,
	start,
	duration,
	transition,
	type = "video",
	hidden,
}: {
	id: string;
	start: number;
	duration: number;
	transition?: ElementTransition;
	type?: "video" | "image" | "effect";
	hidden?: boolean;
}): TimelineElement {
	const base = {
		id,
		name: id,
		startTime: ticks(start),
		duration: ticks(duration),
		trimStart: ticks(0),
		trimEnd: ticks(0),
		params: {},
	};
	if (type === "effect") {
		return { ...base, type, effectType: "adjust" };
	}
	return { ...base, type, mediaId: "m", transition, hidden };
}

const dissolve = (duration: number): ElementTransition => ({
	type: "dissolve",
	duration,
});

describe("resolveTransitionWindows", () => {
	test("경계를 가운데에 두고 양쪽 클립을 반씩 늘린다", () => {
		const { windows, extents } = resolveTransitionWindows({
			elements: [
				clip({ id: "a", start: 0, duration: 4, transition: dissolve(1) }),
				clip({ id: "b", start: 4, duration: 4 }),
			],
		});
		expect(windows).toEqual([
			{ fromId: "a", toId: "b", type: "dissolve", start: 3.5 * S, duration: S },
		]);
		expect(extents.get("a")).toEqual({ before: 0, after: 0.5 * S });
		expect(extents.get("b")).toEqual({ before: 0.5 * S, after: 0 });
	});

	test("전환 길이는 짧은 클립 길이를 넘지 않는다", () => {
		const { windows } = resolveTransitionWindows({
			elements: [
				clip({ id: "a", start: 0, duration: 4, transition: dissolve(3) }),
				clip({ id: "b", start: 4, duration: 1 }),
			],
		});
		expect(windows[0].duration).toBe(S);
	});

	test("떨어진 클립, 다른 종류 클립, 숨긴 클립, 모르는 전환은 무시한다", () => {
		const cases = [
			[
				clip({ id: "a", start: 0, duration: 2, transition: dissolve(1) }),
				clip({ id: "b", start: 3, duration: 2 }),
			],
			[
				clip({ id: "a", start: 0, duration: 2, transition: dissolve(1) }),
				clip({ id: "b", start: 2, duration: 2, type: "effect" }),
			],
			[
				clip({ id: "a", start: 0, duration: 2, transition: dissolve(1) }),
				clip({ id: "b", start: 2, duration: 2, hidden: true }),
			],
			[
				clip({
					id: "a",
					start: 0,
					duration: 2,
					transition: { type: "nope", duration: 1 },
				}),
				clip({ id: "b", start: 2, duration: 2 }),
			],
			[
				clip({ id: "a", start: 0, duration: 2, transition: dissolve(0) }),
				clip({ id: "b", start: 2, duration: 2 }),
			],
		];
		for (const elements of cases) {
			expect(resolveTransitionWindows({ elements }).windows).toEqual([]);
		}
	});

	test("가운데 클립 앞뒤 전환 구간은 겹치지 않는다", () => {
		const { windows, extents } = resolveTransitionWindows({
			elements: [
				clip({ id: "c", start: 3, duration: 2 }),
				clip({ id: "a", start: 0, duration: 2, transition: dissolve(5) }),
				clip({ id: "b", start: 2, duration: 1, transition: dissolve(5) }),
			],
		});
		expect(windows.map((w) => [w.fromId, w.toId])).toEqual([
			["a", "b"],
			["b", "c"],
		]);
		const [first, second] = windows;
		expect(first.start + first.duration).toBeLessThanOrEqual(second.start);
		expect(extents.get("b")).toEqual({ before: 0.5 * S, after: 0.5 * S });
	});

	test("이미지 클립 사이에도 걸린다", () => {
		const { windows } = resolveTransitionWindows({
			elements: [
				clip({
					id: "a",
					start: 0,
					duration: 2,
					type: "image",
					transition: dissolve(1),
				}),
				clip({ id: "b", start: 2, duration: 2, type: "image" }),
			],
		});
		expect(windows).toHaveLength(1);
	});
});

describe("buildTransitionUpdates", () => {
	const track = {
		id: "t",
		elements: [
			clip({ id: "a", start: 0, duration: 2 }),
			clip({ id: "b", start: 2, duration: 2 }),
			clip({ id: "c", start: 5, duration: 2 }),
		],
	};
	const apply = (...ids: string[]) =>
		buildTransitionUpdates({
			tracks: [track],
			selected: ids.map((elementId) => ({ trackId: "t", elementId })),
			transition: dissolve(0.5),
		}).map((update) => update.elementId);

	test("뒤 경계가 있으면 선택한 클립에, 없으면 앞 클립에 건다", () => {
		expect(apply("a")).toEqual(["a"]);
		expect(apply("b")).toEqual(["a"]);
	});

	test("맞붙은 클립이 없으면 아무것도 바꾸지 않는다", () => {
		expect(apply("c")).toEqual([]);
	});

	test("같은 경계는 한 번만 바꾼다", () => {
		expect(apply("a", "b")).toEqual(["a"]);
	});
});
