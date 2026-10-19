import { describe, expect, test } from "bun:test";
import {
	detectSpeechRegions,
	filterHallucinations,
	groupSpeechRegions,
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
	test("최대 길이 안에서 묶고, 넘는 구간은 자른다", () => {
		const groups = groupSpeechRegions({
			regions: [
				{ start: 0, end: 5 },
				{ start: 6, end: 9 },
				{ start: 20, end: 45 },
			],
			maxGroupSeconds: 10,
		});
		expect(groups).toEqual([
			{ start: 0, end: 9 },
			{ start: 20, end: 30 },
			{ start: 30, end: 40 },
			{ start: 40, end: 45 },
		]);
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
