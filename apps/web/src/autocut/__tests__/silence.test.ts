import { describe, expect, test } from "bun:test";
import defaults from "../settings.json";
import {
	type AutocutSettings,
	computeWindowLevels,
	proposeSilenceCuts,
	resolveQuietDb,
} from "../silence";

const W = 0.1;
const LOUD = -20;
const QUIET = -60;
const AMBIENT = -35;

const settings: AutocutSettings = {
	...defaults,
	speech: { threshold: 0.5, mergeSeconds: 0.1, minSpeechSeconds: 0.05 },
	silence: {
		minSilenceSeconds: 0.5,
		keepAfterSpeechSeconds: 0.2,
		keepBeforeSpeechSeconds: 0.1,
		snapRadiusSeconds: 0,
		minCutSeconds: 0.2,
		cutAmbient: false,
	},
};

/** 문자 하나가 창 하나(0.1초): S 말소리, . 조용함, a 말 없는 장면 소리 */
function timeline(pattern: string) {
	const chars = [...pattern];
	return {
		probabilities: chars.map((c) => (c === "S" ? 1 : 0)),
		levels: Float32Array.from(chars, (c) => (c === "S" ? LOUD : c === "a" ? AMBIENT : QUIET)),
		windowSeconds: W,
	};
}

const ranges = (cuts: { start: number; end: number }[]) =>
	cuts.map(({ start, end }) => [Number(start.toFixed(3)), Number(end.toFixed(3))]);

describe("proposeSilenceCuts", () => {
	test("말 사이 긴 침묵을 앞뒤 여유를 남기고 자른다", () => {
		const cuts = proposeSilenceCuts({ ...timeline("SSS..........SSS"), settings });
		expect(ranges(cuts)).toEqual([[0.5, 1.2]]);
		expect(cuts[0].reason).toBe("silence");
	});

	test("짧은 쉼은 자르지 않는다", () => {
		expect(proposeSilenceCuts({ ...timeline("SSS....SSS"), settings })).toEqual([]);
	});

	test("영상 처음과 끝의 침묵은 여유 없이 끝까지 자른다", () => {
		expect(ranges(proposeSilenceCuts({ ...timeline("......SSS......"), settings }))).toEqual([
			[0, 0.5],
			[1.1, 1.5],
		]);
	});

	test("말은 없어도 장면 소리가 있는 곳은 남긴다", () => {
		const pattern = "SSS..........aaaaaaaaaa..........SSS";
		const cuts = proposeSilenceCuts({ ...timeline(pattern), settings });
		// 장면 소리 앞뒤 조용한 부분만 잘리고 장면 소리 자체는 남는다
		for (const cut of cuts) {
			expect(cut.end <= 1.3 + 1e-9 || cut.start >= 2.3 - 1e-9).toBe(true);
		}
		expect(cuts.length).toBe(2);

		const all = proposeSilenceCuts({
			...timeline(pattern),
			settings: { ...settings, silence: { ...settings.silence, cutAmbient: true } },
		});
		expect(ranges(all)).toEqual([[0.5, 3.2]]);
	});

	test("VAD가 놓친 단어도 자르지 않는다", () => {
		const cuts = proposeSilenceCuts({
			...timeline("SSS..........SSS"),
			words: [{ start: 0.8, end: 0.9 }],
			settings,
		});
		for (const cut of cuts) {
			expect(cut.end <= 0.8 || cut.start >= 0.9).toBe(true);
		}
	});

	test("여유 안에서 가장 조용한 창으로 컷 위치를 옮긴다", () => {
		const t = timeline("SSS..........SSS");
		t.levels[6] = QUIET - 20;
		const cuts = proposeSilenceCuts({
			...t,
			settings: { ...settings, silence: { ...settings.silence, snapRadiusSeconds: 0.2 } },
		});
		expect(Number(cuts[0].start.toFixed(3))).toBe(0.6);
	});

	test("프레임 경계에 맞출 때는 자르는 구간이 줄어든다", () => {
		const cuts = proposeSilenceCuts({
			...timeline("SSS..........SSS"),
			frameSeconds: 1 / 3,
			settings,
		});
		expect(ranges(cuts)).toEqual([[0.667, 1]]);
	});
});

describe("resolveQuietDb", () => {
	test("디지털 무음이 많아도 바닥 소음을 최소값 아래로 내리지 않는다", () => {
		const levels = new Float32Array(100).fill(defaults.level.silentDb);
		expect(resolveQuietDb({ levels, level: defaults.level })).toBe(
			defaults.level.minNoiseFloorDb + defaults.level.quietMarginDb,
		);
	});

	test("시끄러운 녹음에서도 상한을 넘지 않는다", () => {
		const levels = new Float32Array(100).fill(-25);
		expect(resolveQuietDb({ levels, level: defaults.level })).toBe(defaults.level.maxQuietDb);
	});
});

describe("computeWindowLevels", () => {
	test("창마다 dBFS를 재고 무음은 바닥값으로 둔다", () => {
		const audio = new Float32Array(8);
		audio.fill(0.5, 0, 4);
		const levels = computeWindowLevels({ audio, windowSamples: 4, silentDb: -120 });
		expect(levels[0]).toBeCloseTo(20 * Math.log10(0.5));
		expect(levels[1]).toBe(-120);
	});
});
