import { describe, expect, test } from "bun:test";
import { correctSegments, extractCorrections, mergeCorrections } from "../correction";
import defaults from "../settings.json";
import type { TranscriptionSegment } from "../types";

const settings = { ...defaults.correction, contextWords: ["큰술", "넣"], contextSeconds: 3, trustCount: 2 };

describe("extractCorrections", () => {
	const extract = ({ before, after }: { before: string; after: string }) =>
		extractCorrections({ before, after, maxPhraseWords: 3 });

	test("바뀐 단어만 쌍으로 뽑는다", () => {
		expect(extract({ before: "미혼 반큰술", after: "미림 반큰술" })).toEqual([{ from: "미혼", to: "미림" }]);
	});

	test("같이 바뀐 조사는 떼고 낱말만 남긴다", () => {
		expect(extract({ before: "견고취가 있으면 좋은데", after: "건고추가 있으면 좋은데" })).toEqual([
			{ from: "견고취", to: "건고추" },
		]);
	});

	test("떼고 남는 글자가 한 자면 떼지 않는다", () => {
		expect(extract({ before: "매술", after: "맛술" })).toEqual([{ from: "매술", to: "맛술" }]);
	});

	test("단어 수가 달라지면 묶음으로 뽑는다", () => {
		expect(extract({ before: "이건 클래식한 안경 찐떡은 아니네", after: "이건 클래식한 안동찜닭은 아니네" })).toEqual([
			{ from: "안경 찐떡", to: "안동찜닭" },
		]);
		expect(extract({ before: "남궁진닭은 아니네", after: "안동찜닭은 아니네" })).toEqual([
			{ from: "남궁진닭", to: "안동찜닭" },
		]);
	});

	test("띄어쓰기·문장부호만 고친 것과 긴 고쳐 쓰기는 버린다", () => {
		expect(extract({ before: "맛있어 맛있어", after: "맛있어. 맛있어!" })).toEqual([]);
		expect(extract({ before: "가 나 다 라", after: "마 바 사 아" })).toEqual([]);
		expect(extract({ before: "응", after: "응 2큰술" })).toEqual([]);
	});
});

const segment = ({ start, text }: { start: number; text: string }): TranscriptionSegment => {
	const words = text.split(" ").map((word, index) => ({ text: word, start: start + index * 0.5, end: start + index * 0.5 + 0.4 }));
	return { text, start, end: words.at(-1)!.end, words };
};

describe("correctSegments", () => {
	const once = [{ from: "미혼", to: "미림", count: 1 }];

	test("한 번 배운 바꿈은 분량·동작 말 근처에서만 바꾼다", () => {
		const result = correctSegments({
			segments: [segment({ start: 0, text: "미혼" }), segment({ start: 33, text: "미혼 반큰술" })],
			corrections: once,
			settings,
		});
		expect(result.map((s) => s.text)).toEqual(["미혼", "미림 반큰술"]);
		expect(result[1].words?.map((word) => word.text)).toEqual(["미림", "반큰술"]);
	});

	test("여러 번 고친 바꿈은 어디서나 바꾸고 뒤 조사는 남긴다", () => {
		const result = correctSegments({
			segments: [segment({ start: 0, text: "견고취가 있으면 좋은데" })],
			corrections: [{ from: "견고취", to: "건고추", count: 2 }],
			settings,
		});
		expect(result[0].text).toBe("건고추가 있으면 좋은데");
	});

	test("배우지 않은 말장난은 건드리지 않는다", () => {
		const segments = [segment({ start: 105, text: "술맛 아니고요 맛술입니다" })];
		expect(
			correctSegments({ segments, corrections: [{ from: "매술", to: "맛술", count: 3 }], settings })[0],
		).toBe(segments[0]);
	});

	test("여러 단어짜리 바꿈은 단어 시각을 하나로 합친다", () => {
		const [result] = correctSegments({
			segments: [segment({ start: 5, text: "클래식한 안경 찐떡은 아니네" })],
			corrections: [{ from: "안경 찐떡", to: "안동찜닭", count: 2 }],
			settings,
		});
		expect(result.words?.map((word) => [word.text, word.start, word.end])).toEqual([
			["클래식한", 5, 5.4],
			["안동찜닭은", 5.5, 6.4],
			["아니네", 6.5, 6.9],
		]);
	});
});

describe("mergeCorrections", () => {
	test("같은 바꿈은 횟수를 더하고, 다르게 고치면 새 쪽으로 바꾼다", () => {
		const merged = mergeCorrections({
			corrections: [{ from: "미혼", to: "미림", count: 1 }, { from: "마술", to: "미술", count: 1 }],
			learned: [{ from: "미혼", to: "미림" }, { from: "마술", to: "맛술" }, { from: "냉탈", to: "냄비" }],
		});
		expect(merged).toEqual([
			{ from: "미혼", to: "미림", count: 2 },
			{ from: "마술", to: "맛술", count: 1 },
			{ from: "냉탈", to: "냄비", count: 1 },
		]);
	});

	test("고친 걸 되돌리면 그 바꿈을 지운다", () => {
		expect(
			mergeCorrections({
				corrections: [{ from: "미원", to: "미림", count: 1 }],
				learned: [{ from: "미림", to: "미원" }],
			}),
		).toEqual([]);
	});
});
