import { describe, expect, test } from "bun:test";
import {
	detectSpeechRegions,
	filterHallucinations,
	findMissedRegions,
	groupSpeechRegions,
	joinRegions,
	toOriginalRange,
} from "../speech-regions";

const WORD_SECONDS = 0.4;
const word = ({ text, start }: { text: string; start: number }) => ({
	text,
	start,
	end: start + WORD_SECONDS,
});

describe("detectSpeechRegions", () => {
	const base = {
		windowSeconds: 0.25,
		threshold: 0.5,
		minSilenceSeconds: 0.75,
		minSpeechSeconds: 0.5,
		speechPadSeconds: 0,
	};

	test("짧은 쉼은 하나로 잇고 긴 침묵에서 나눈다", () => {
		const probabilities = [0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 1];
		expect(
			detectSpeechRegions({ ...base, probabilities, totalSeconds: 3.25 }),
		).toEqual([
			{ start: 0.25, end: 1.5 },
			{ start: 2.5, end: 3.25 },
		]);
	});

	test("너무 짧은 소리는 버린다", () => {
		expect(
			detectSpeechRegions({ ...base, probabilities: [0, 1, 0, 0, 0, 0], totalSeconds: 1.5 }),
		).toEqual([]);
	});
});

describe("groupSpeechRegions", () => {
	test("무음을 줄여 이은 길이로 묶고, 넘는 구간은 자른다", () => {
		const groups = groupSpeechRegions({
			regions: [
				{ start: 0, end: 5 },
				{ start: 6, end: 9 },
				{ start: 20, end: 45 },
			],
			maxGroupSeconds: 10,
			joinSeconds: 0.5,
		});
		expect(groups).toEqual([
			[
				{ start: 0, end: 5 },
				{ start: 6, end: 9 },
			],
			[{ start: 20, end: 30 }],
			[{ start: 30, end: 40 }],
			[{ start: 40, end: 45 }],
		]);
	});

	test("긴 무음을 사이에 둔 짧은 말들도 한 묶음이 된다", () => {
		const groups = groupSpeechRegions({
			regions: [
				{ start: 0, end: 4 },
				{ start: 20, end: 24 },
			],
			maxGroupSeconds: 10,
			joinSeconds: 0.5,
		});
		expect(groups).toEqual([
			[
				{ start: 0, end: 4 },
				{ start: 20, end: 24 },
			],
		]);
	});
});

describe("toOriginalRange", () => {
	// 이은 오디오: 0~2초는 원래 10~12초, 0.5초 줄인 무음, 2.5~3.5초는 원래 30~31초
	const joined = joinRegions({
		regions: [
			{ start: 10, end: 12 },
			{ start: 30, end: 31 },
		],
		joinSeconds: 0.5,
	});
	const expectRange = ({ start, end, expected }: { start: number; end: number; expected: [number, number] }) => {
		const range = toOriginalRange({ joined, start, end });
		expect(range.start).toBeCloseTo(expected[0]);
		expect(range.end).toBeCloseTo(expected[1]);
	};

	test("구간 안의 단어는 원래 시각으로 되돌린다", () => {
		expectRange({ start: 0.5, end: 1, expected: [10.5, 11] });
		expectRange({ start: 2.7, end: 3, expected: [30.2, 30.5] });
	});

	test("경계에 걸친 단어는 긴 무음을 차지하지 않고 더 많이 겹치는 구간에 들어간다", () => {
		expectRange({ start: 1.2, end: 2.6, expected: [11.2, 12] });
		expectRange({ start: 1.9, end: 3.2, expected: [30, 30.7] });
	});
});

describe("findMissedRegions", () => {
	test("단어가 하나도 없는 긴 구간만 돌려준다", () => {
		const regions = [
			{ start: 0, end: 4 },
			{ start: 5, end: 9 },
			{ start: 10, end: 10.5 },
		];
		const words = [{ start: 6, end: 6.4 }];
		expect(findMissedRegions({ regions, words, minSeconds: 1.5 })).toEqual([{ start: 0, end: 4 }]);
	});
});

describe("filterHallucinations", () => {
	const base = {
		maxRepeats: 2,
		maxRepeatNgram: 3,
		minSpeechOverlap: 0.5,
		phrases: ["시청해주셔서감사합니다"],
	};

	test("반복 루프는 maxRepeats번만 남긴다", () => {
		const words = ["좋아요", "오늘은", "오늘은", "오늘은", "오늘은"].map((text, i) => word({ text, start: i }));
		const kept = filterHallucinations({
			...base,
			words,
			speechRegions: [{ start: 0, end: 10 }],
		});
		expect(kept.map((w) => w.text)).toEqual(["좋아요", "오늘은", "오늘은"]);
	});

	test("여러 단어 묶음 반복도 줄인다", () => {
		const words = ["맛있게", "드세요", "맛있게", "드세요", "맛있게", "드세요"].map((text, i) =>
			word({ text, start: i }),
		);
		const kept = filterHallucinations({ ...base, words, speechRegions: [{ start: 0, end: 10 }] });
		expect(kept.map((w) => w.text)).toEqual(["맛있게", "드세요", "맛있게", "드세요"]);
	});

	test("말소리 없는 곳의 환각 문구는 지우고, 실제로 말한 것은 남긴다", () => {
		const words = [word({ text: "감사합니다", start: 1 }), word({ text: "시청해", start: 5 }), word({ text: "주셔서", start: 5.4 }), word({ text: "감사합니다.", start: 5.8 })];
		const silent = filterHallucinations({ ...base, words, speechRegions: [{ start: 0, end: 2 }] });
		expect(silent.map((w) => w.text)).toEqual(["감사합니다"]);

		const spoken = filterHallucinations({ ...base, words, speechRegions: [{ start: 0, end: 7 }] });
		expect(spoken).toHaveLength(4);
	});
});
