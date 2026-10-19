import { describe, expect, test } from "bun:test";
import { formatSrt, parseSrt } from "../srt";

describe("formatSrt", () => {
	test("번호, 시:분:초,밀리초 시간, 텍스트를 빈 줄로 나눠 쓴다", () => {
		expect(
			formatSrt({
				cues: [
					{ text: "첫 줄\n둘째 줄", startTime: 1.25, duration: 2 },
					{ text: "끝", startTime: 3723.5, duration: 0.5 },
				],
			}),
		).toBe(
			"1\n00:00:01,250 --> 00:00:03,250\n첫 줄\n둘째 줄\n\n2\n01:02:03,500 --> 01:02:04,000\n끝\n",
		);
	});

	test("내보낸 SRT를 다시 읽으면 시간과 텍스트가 같다", () => {
		const cues = [
			{ text: "오늘은 국밥", startTime: 0.6, duration: 1.234 },
			{ text: "두 줄\n자막", startTime: 61.05, duration: 2.5 },
		];
		expect(parseSrt({ input: formatSrt({ cues }) }).captions).toEqual(cues);
	});
});
