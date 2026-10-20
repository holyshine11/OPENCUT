import { describe, expect, test } from "bun:test";
import { frameDifference, proposeEditPoints } from "../edit-points";
import defaults from "../settings.json";
import type { AutocutSettings } from "../silence";

const W = 0.5;

const settings: AutocutSettings = {
	...defaults,
	motion: { ...defaults.motion, staticBelow: 3 },
	editPoints: {
		...defaults.editPoints,
		speechBeforeSeconds: 0,
		speechAfterSeconds: 0,
		minGapSeconds: 2,
		smoothWindows: 1,
		targetSeconds: 1,
		minRate: 2,
		maxRate: 5,
		rateStep: 0.5,
	},
};

/** 문자 하나가 0.5초: S 말하는 중, . 멈춘 화면, m 움직이는 화면 */
function timeline(pattern: string) {
	const chars = [...pattern];
	const speech: { start: number; end: number }[] = [];
	chars.forEach((c, i) => {
		if (c !== "S") return;
		const last = speech.at(-1);
		if (last && last.end === i * W) last.end = (i + 1) * W;
		else speech.push({ start: i * W, end: (i + 1) * W });
	});
	return { motion: chars.map((c) => (c === "m" ? 10 : 1)), motionSeconds: W, speech };
}

const summary = ({
	pattern,
	override = {},
}: {
	pattern: string;
	override?: Partial<AutocutSettings["editPoints"]>;
}) =>
	proposeEditPoints({
		...timeline(pattern),
		settings: { ...settings, editPoints: { ...settings.editPoints, ...override } },
	}).map(({ start, end, reason, rate }) => [start, end, reason, rate]);

describe("proposeEditPoints", () => {
	test("말 사이 멈춘 화면은 컷, 움직이는 화면은 배속으로 제안한다", () => {
		expect(summary({ pattern: "SS........SSmmmmmmmmSS" })).toEqual([
			[1, 5, "static", undefined],
			[6, 10, "process", 4],
		]);
	});

	test("말 사이 짧은 쉼은 남긴다", () => {
		expect(summary({ pattern: "SS...SSmmmSS" })).toEqual([]);
	});

	test("빈 구간 안에서 멈춤과 움직임을 나눈다", () => {
		expect(summary({ pattern: "SS........mmmmmmmmSS" })).toEqual([
			[1, 5, "static", undefined],
			[5, 9, "process", 4],
		]);
	});

	test("잠깐 손이 들어온 정도로는 구간을 쪼개지 않는다", () => {
		expect(summary({ pattern: "SS....mm....SS" })).toEqual([[1, 6, "static", undefined]]);
	});

	test("배속은 목표 길이에 맞추되 최대 배속을 넘지 않고, 최소 배속보다 느리면 제안하지 않는다", () => {
		expect(summary({ pattern: `SS${"m".repeat(20)}SS` })).toEqual([[1, 11, "process", 5]]);
		expect(summary({ pattern: "SSmmmmmSS", override: { targetSeconds: 1.5 } })).toEqual([]);
	});

	test("말 앞뒤 여유는 남긴다", () => {
		expect(summary({ pattern: "SS........SS", override: { speechBeforeSeconds: 0.5, speechAfterSeconds: 1 } })).toEqual([
			[2, 4.5, "static", undefined],
		]);
	});

	test("프레임에 맞출 때 제안 구간이 줄어드는 쪽으로 반올림한다", () => {
		const cuts = proposeEditPoints({
			...timeline("SS........SS"),
			frameSeconds: 0.4,
			settings: { ...settings, editPoints: { ...settings.editPoints, speechAfterSeconds: 0.1 } },
		});
		expect(cuts.map(({ start, end }) => [Number(start.toFixed(3)), Number(end.toFixed(3))])).toEqual([[1.2, 4.8]]);
	});
});

describe("frameDifference", () => {
	test("같은 프레임은 0, 흑백이 뒤집히면 255", () => {
		const black = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
		const white = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
		expect(frameDifference({ previous: black, next: black })).toBe(0);
		expect(frameDifference({ previous: black, next: white })).toBeCloseTo(255);
	});
});
