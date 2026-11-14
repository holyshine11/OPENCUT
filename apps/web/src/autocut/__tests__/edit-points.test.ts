import { describe, expect, test } from "bun:test";
import { findFillers, findRetakes, frameDifference, proposeEditPoints } from "../edit-points";
import defaults from "../settings.json";
import type { AutocutSettings } from "../speech";

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

describe("findFillers", () => {
	const word = ([start, end, text]: [number, number, string]) => ({ start, end, text });

	test("자막의 필러 단어는 문장부호를 떼고 찾는다", () => {
		const words = [word([1, 2, "그래서"]), word([2, 2.4, "음,"]), word([2.4, 3, "이걸"])];
		expect(findFillers({ vad: [], words, settings })).toEqual([{ start: 2, end: 2.4 }]);
	});

	test("받아쓰기가 뺀 짧은 말소리는 필러로 보고, 길거나 단어와 겹치면 아니다", () => {
		const words = [word([1, 2, "그래서"]), word([5, 6, "이걸"])];
		const vad = [
			{ start: 1, end: 2 },
			{ start: 3, end: 3.5 },
			{ start: 3.8, end: 3.9 },
			{ start: 6.5, end: 8 },
		];
		expect(findFillers({ vad, words, settings })).toEqual([{ start: 3, end: 3.5 }]);
	});

	test("자막이 없으면 짧은 말소리만으로는 찾지 않는다", () => {
		expect(findFillers({ vad: [{ start: 3, end: 3.5 }], words: [], settings })).toEqual([]);
	});
});

describe("필러 지점", () => {
	test("필러 앞뒤를 1초보다 짧아도 따로 나누고, 필러 안과 바로 옆 지점은 뺀다", () => {
		const points = proposeEditPoints({
			...timeline("....SSSSSSSS...."),
			fillers: [{ start: 4, end: 4.4 }],
			settings,
		}).map(({ time, reason }) => [time, reason]);
		expect(points).toEqual([
			[2, "speechStart"],
			[4, "fillerStart"],
			[4.4, "fillerEnd"],
			[6, "speechEnd"],
		]);
	});

	test("말 시작 바로 옆의 필러는 말 시작 지점을 대신한다", () => {
		const points = proposeEditPoints({
			...timeline("....SSSSSSSS...."),
			fillers: [{ start: 2, end: 2.3 }],
			settings,
		}).map(({ reason }) => reason);
		expect(points).toEqual(["fillerStart", "fillerEnd", "speechEnd"]);
	});
});

describe("findRetakes", () => {
	/** 자막 하나(큐)를 공백 단어로 나눠 구간 안에 고르게 놓는다 */
	const cue = (id: string, start: number, end: number, text: string) => {
		const texts = text.split(" ");
		const step = (end - start) / texts.length;
		return texts.map((t, i) => ({ start: start + i * step, end: start + (i + 1) * step, text: t, cue: id }));
	};

	test("필러 큐를 사이에 두고 같은 문장을 다시 말하면 앞 테이크부터 다시 말한 곳까지", () => {
		const words = [
			...cue("a", 1, 3, "오늘은 마술을 보여드릴게요"),
			...cue("b", 3.5, 3.8, "어"),
			...cue("c", 4, 6, "오늘은 마술을 보여드릴게요."),
		];
		expect(findRetakes({ words, settings })).toEqual([{ start: 1, end: 4 }]);
	});

	test("앞 테이크가 중간에 끊겨도 뒤 문장 앞부분과 같으면 찾는다", () => {
		const words = [...cue("a", 1, 2, "오늘은 마술을"), ...cue("b", 2.5, 5, "오늘은 마술을 보여드릴게요")];
		expect(findRetakes({ words, settings })).toEqual([{ start: 1, end: 2.5 }]);
	});

	test("받아쓰기 글자 하나 차이는 봐준다", () => {
		const words = [...cue("a", 1, 3, "오늘은 매술을 보여드릴게요"), ...cue("b", 3.5, 5, "오늘은 마술을 보여드릴게요")];
		expect(findRetakes({ words, settings })).toEqual([{ start: 1, end: 3.5 }]);
	});

	test("앞부분만 같은 다른 문장, 너무 짧은 문장, 멀리 떨어진 문장은 리테이크가 아니다", () => {
		const prefix = [...cue("a", 1, 3, "그래서 이제 마늘을 넣을게요"), ...cue("b", 3.5, 5, "그래서 이제 간장을 넣을게요")];
		const short = [...cue("a", 1, 2, "자 그러면"), ...cue("b", 2.5, 4, "자 그러면 시작할게요")];
		const far = [...cue("a", 1, 3, "오늘은 마술을 보여드릴게요"), ...cue("b", 30, 32, "오늘은 마술을 보여드릴게요")];
		for (const words of [prefix, short, far]) expect(findRetakes({ words, settings })).toEqual([]);
	});
});

describe("리테이크 지점", () => {
	test("리테이크 앞뒤에 지점을 넣고 기본으로 체크하지 않는다", () => {
		const points = proposeEditPoints({
			...timeline("....SSSSSSSSSSSS...."),
			retakes: [{ start: 2, end: 4 }],
			settings,
		}).map(({ time, reason, enabled }) => [time, reason, enabled]);
		expect(points).toEqual([
			[2, "retakeStart", false],
			[4, "retakeEnd", false],
			[8, "speechEnd", true],
		]);
	});

	test("리테이크 안의 필러 지점은 남긴다", () => {
		const points = proposeEditPoints({
			...timeline("....SSSSSSSSSSSS...."),
			fillers: [{ start: 3, end: 3.4 }],
			retakes: [{ start: 2, end: 4 }],
			settings,
		}).map(({ reason }) => reason);
		expect(points).toEqual(["retakeStart", "fillerStart", "fillerEnd", "retakeEnd", "speechEnd"]);
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
