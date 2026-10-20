import { describe, expect, test } from "bun:test";
import { frameDifference, proposeEditPoints } from "../edit-points";
import defaults from "../settings.json";
import type { AutocutSettings } from "../silence";

const W = 0.5;

const settings: AutocutSettings = {
	...defaults,
	motion: { ...defaults.motion, staticBelow: 3 },
	editPoints: {
		speechBeforeSeconds: 0,
		speechAfterSeconds: 0,
		pauseSeconds: 0.6,
		minUtteranceSeconds: 0.3,
		minPieceSeconds: 1,
		minRunSeconds: 1.5,
		smoothWindows: 1,
		eventAbove: 12,
	},
};

/** 문자 하나가 0.5초: S 말하는 중, . 멈춘 화면, m 움직이는 화면, M 손이 들어온 큰 움직임, X 말하면서 큰 움직임 */
function timeline(pattern: string) {
	const chars = [...pattern];
	const speech: { start: number; end: number }[] = [];
	chars.forEach((c, i) => {
		if (c !== "S" && c !== "X") return;
		const last = speech.at(-1);
		if (last && last.end === i * W) last.end = (i + 1) * W;
		else speech.push({ start: i * W, end: (i + 1) * W });
	});
	return { motion: chars.map((c) => (c === "M" || c === "X" ? 20 : c === "m" ? 10 : 1)), motionSeconds: W, speech };
}

const summary = ({
	pattern,
	override = {},
	frameSeconds,
}: {
	pattern: string;
	override?: Partial<AutocutSettings["editPoints"]>;
	frameSeconds?: number;
}) =>
	proposeEditPoints({
		...timeline(pattern),
		frameSeconds,
		settings: { ...settings, editPoints: { ...settings.editPoints, ...override } },
	}).map(({ time, reason }) => [Number(time.toFixed(3)), reason]);

describe("proposeEditPoints", () => {
	test("말 한 마디의 시작과 끝에서 나눈다", () => {
		expect(summary({ pattern: "....SSSS...." })).toEqual([
			[2, "speechStart"],
			[4, "speechEnd"],
		]);
	});

	test("짧은 쉼은 한 마디로 보고, 긴 쉼은 두 마디로 나눈다", () => {
		expect(summary({ pattern: "..SSS.SSS.." })).toEqual([
			[1, "speechStart"],
			[4.5, "speechEnd"],
		]);
		expect(summary({ pattern: "..SSS...SSS.." })).toEqual([
			[1, "speechStart"],
			[2.5, "speechEnd"],
			[4, "speechStart"],
			[5.5, "speechEnd"],
		]);
	});

	test("말 앞뒤 여유를 두고 나눈다", () => {
		expect(summary({ pattern: "....SSSS....", override: { speechBeforeSeconds: 0.5, speechAfterSeconds: 1 } })).toEqual([
			[1.5, "speechStart"],
			[5, "speechEnd"],
		]);
	});

	test("말 없는 구간에서 화면이 움직이기 시작하거나 멈추는 곳에서 나눈다", () => {
		expect(summary({ pattern: "SS........mmmmmm....SS" })).toEqual([
			[1, "speechEnd"],
			[5, "motionStart"],
			[8, "motionStop"],
			[10, "speechStart"],
		]);
	});

	test("잠깐 손이 들어온 정도의 짧은 덩어리로는 나누지 않는다", () => {
		expect(summary({ pattern: "SS....mm....SS" })).toEqual([
			[1, "speechEnd"],
			[6, "speechStart"],
		]);
	});

	test("움직임이 갑자기 커지는 순간(재료 넣기)에서 나눈다", () => {
		expect(summary({ pattern: "SS....mmmmMMMMmmmm....SS" })).toEqual([
			[1, "speechEnd"],
			[3, "motionStart"],
			[5, "event"],
			[9, "motionStop"],
			[11, "speechStart"],
		]);
	});

	test("말하는 중에는 움직임으로 나누지 않는다", () => {
		expect(summary({ pattern: "..SSXXSS.." })).toEqual([
			[1, "speechStart"],
			[4, "speechEnd"],
		]);
	});

	test("지점 사이가 짧으면 말 경계만 남긴다", () => {
		const override = { minRunSeconds: 0.5, speechBeforeSeconds: 0.5, speechAfterSeconds: 0.5 };
		expect(summary({ pattern: "......mmSS....", override })).toEqual([
			[3.5, "speechStart"],
			[5.5, "speechEnd"],
		]);
		expect(summary({ pattern: "....SSmm......", override })).toEqual([
			[1.5, "speechStart"],
			[3.5, "speechEnd"],
		]);
	});

	test("말 사이 쉼이 짧으면 쉼의 가운데 한 지점으로 합치고, 여유가 쉼을 넘지 않는다", () => {
		expect(summary({ pattern: "..SSSS.SSSS..", override: { pauseSeconds: 0.2 } })).toEqual([
			[1, "speechStart"],
			[3.25, "speechStart"],
			[5.5, "speechEnd"],
		]);
		expect(
			summary({ pattern: "..SSSS.SSSS..", override: { pauseSeconds: 0.2, speechBeforeSeconds: 1, speechAfterSeconds: 1 } }),
		).toEqual([[3.25, "speechStart"]]);
	});

	test("아주 짧은 말은 무시하고, 짧은 말은 시작 앞 한 지점만 낸다", () => {
		expect(summary({ pattern: "....S.......", override: { minUtteranceSeconds: 0.6 } })).toEqual([]);
		expect(summary({ pattern: "....S.......", override: { minUtteranceSeconds: 0.5 } })).toEqual([[2, "speechStart"]]);
	});

	test("양 끝에 너무 가까운 지점은 버린다", () => {
		expect(summary({ pattern: "S........S" })).toEqual([]);
	});

	test("프레임에 맞춘다", () => {
		expect(summary({ pattern: "....SSSS....", frameSeconds: 0.4, override: { speechBeforeSeconds: 0.1 } })).toEqual([
			[2, "speechStart"],
			[4, "speechEnd"],
		]);
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
