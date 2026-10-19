import { describe, expect, test } from "bun:test";
import { buildCaptionChunks } from "../caption";
import { parseTerms } from "../terms-store";

describe("buildCaptionChunks", () => {
	test("단어 시간 정보가 있으면 실제 발화 시간을 쓴다", () => {
		const captions = buildCaptionChunks({
			segments: [
				{
					text: "a b c d",
					start: 1,
					end: 5,
					words: [
						{ text: "a", start: 1, end: 1.5 },
						{ text: "b", start: 1.5, end: 2 },
						{ text: "c", start: 2, end: 2.5 },
						{ text: "d", start: 4, end: 4.2 },
					],
				},
			],
			wordsPerChunk: 3,
			minDuration: 0.5,
		});
		expect(captions).toEqual([
			{ text: "a b c", startTime: 1, duration: 1.5 },
			{ text: "d", startTime: 4, duration: 0.5 },
		]);
	});
});

describe("parseTerms", () => {
	test("쉼표와 줄바꿈으로 나누고 빈 값과 중복을 뺀다", () => {
		expect(parseTerms({ input: "옥동식, 석박지\n 옥동식 ,,\n영동감자탕" })).toEqual([
			"옥동식",
			"석박지",
			"영동감자탕",
		]);
	});
});
