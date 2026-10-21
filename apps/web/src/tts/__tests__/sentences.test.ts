import { describe, expect, test } from "bun:test";
import { nextTtsFileNumber, splitSentences } from "../sentences";
import { buildLineCaptions, placeLines } from "../placement";

const LONG_LIMIT = 1000;

describe("splitSentences", () => {
	test(". ? ! …에서 나누고 문장부호는 남긴다", () => {
		expect(
			splitSentences({
				text: "양파를 썰어요. 얼마나 넣을까요? 아주 맛있어요! 그다음에는…",
				maxChars: LONG_LIMIT,
			}),
		).toEqual(["양파를 썰어요.", "얼마나 넣을까요?", "아주 맛있어요!", "그다음에는…"]);
	});

	test("줄바꿈도 문장 경계이고 빈 줄과 공백은 버린다", () => {
		expect(
			splitSentences({
				text: "  재료 준비\n\n   \n불을 켭니다.  \n",
				maxChars: LONG_LIMIT,
			}),
		).toEqual(["재료 준비", "불을 켭니다."]);
	});

	test("숫자 사이 마침표에서는 나누지 않는다", () => {
		expect(
			splitSentences({ text: "소금 0.5큰술을 넣어요. 끝.", maxChars: LONG_LIMIT }),
		).toEqual(["소금 0.5큰술을 넣어요.", "끝."]);
	});

	test("말줄임표와 닫는 따옴표는 앞 문장에 붙는다", () => {
		expect(
			splitSentences({
				text: "그래서... \"정말요?\" 네.",
				maxChars: LONG_LIMIT,
			}),
		).toEqual(["그래서...", "\"정말요?\"", "네."]);
	});

	test("문장부호만 있는 조각은 버린다", () => {
		expect(splitSentences({ text: "...\n!?\n좋아요.", maxChars: LONG_LIMIT })).toEqual([
			"좋아요.",
		]);
	});

	test("너무 긴 문장은 쉼표에서 나누고 짧은 조각은 다시 붙인다", () => {
		expect(
			splitSentences({
				text: "양파는 채 썰고, 당근은 깍둑 썰고, 감자는 껍질을 벗겨서 물에 담가 둡니다.",
				maxChars: 20,
			}),
		).toEqual(["양파는 채 썰고, 당근은 깍둑 썰고,", "감자는 껍질을 벗겨서 물에 담가 둡니다."]);
	});

	test("쉼표가 없거나 숫자 자리 쉼표뿐이면 긴 문장도 그대로 둔다", () => {
		const sentence = "설탕을 1,000그램이나 넣으면 너무 달아요.";
		expect(splitSentences({ text: sentence, maxChars: 10 })).toEqual([sentence]);
	});
});

const SHORT = {
	maxCharsPerLine: 12,
	maxLines: 1,
	minDuration: 0.6,
	maxDuration: 3,
	stripPunctuation: true,
};

describe("placeLines", () => {
	test("시작 위치부터 이어 놓고 문장 사이를 쉼만큼 비운다", () => {
		const segments = placeLines({
			lines: [
				{ text: "하나.", duration: 1.5 },
				{ text: "둘.", duration: 2 },
				{ text: "셋.", duration: 1 },
			],
			start: 10,
			pause: 0.3,
		});
		expect(segments.map((segment) => segment.text)).toEqual(["하나.", "둘.", "셋."]);
		const expected = [
			[10, 11.5],
			[11.8, 13.8],
			[14.1, 15.1],
		];
		for (const [index, [start, end]] of expected.entries()) {
			expect(segments[index].start).toBeCloseTo(start);
			expect(segments[index].end).toBeCloseTo(end);
		}
	});

	test("쉼이 0이면 맞붙인다", () => {
		const [first, second] = placeLines({
			lines: [
				{ text: "a", duration: 1 },
				{ text: "b", duration: 1 },
			],
			start: 0,
			pause: 0,
		});
		expect(second.start).toBe(first.end);
	});
});

describe("buildLineCaptions", () => {
	test("문장 자막은 모두 그 문장 음성 구간 안에 있다", () => {
		const segment = {
			text: "양파와 당근을 잘게 썰어서 프라이팬에 볶아 주세요.",
			start: 5,
			end: 9,
		};
		const captions = buildLineCaptions({ segment, layout: SHORT });
		expect(captions.length).toBeGreaterThan(1);
		expect(captions[0].startTime).toBe(segment.start);
		for (const caption of captions) {
			expect(caption.startTime).toBeGreaterThanOrEqual(segment.start);
			expect(caption.startTime + caption.duration).toBeLessThanOrEqual(segment.end + 1e-9);
		}
	});

	test("짧은 음성은 최소 표시 시간이 있어도 음성 끝에서 자막이 끝난다", () => {
		const captions = buildLineCaptions({
			segment: { text: "네.", start: 2, end: 2.3 },
			layout: SHORT,
		});
		expect(captions.map((caption) => caption.text)).toEqual(["네"]);
		expect(captions[0].startTime).toBe(2);
		expect(captions[0].duration).toBeCloseTo(0.3);
	});
});

describe("nextTtsFileNumber", () => {
	test("같은 목소리 파일 중 가장 큰 번호 다음", () => {
		expect(
			nextTtsFileNumber({
				names: ["tts-송이-001.mp3", "tts-송이-012.mp3", "tts-송강-030.mp3", "intro.mp4"],
				voice: "송이",
			}),
		).toBe(13);
	});

	test("없으면 1", () => {
		expect(nextTtsFileNumber({ names: ["tts-송강-004.mp3"], voice: "송이" })).toBe(1);
	});
});
