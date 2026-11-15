import { describe, expect, test } from "bun:test";
import { briefText, parseBrief } from "../brief";

describe("기획안", () => {
	test("배열로 온 칸은 줄로 펴고, 빈 칸과 답 없는 질문은 확정 글에서 뺀다", () => {
		const brief = parseBrief({
			output: `기획안입니다\n${JSON.stringify({
				title: "감히 꽃게찜에 소주를?",
				recipe: ["꽃게 2마리", "1. 파 마늘 볶기"],
				flow: "훅 → 손질 → 시식",
				points: "",
				funny: ["옆에서 집어 먹다 혼남"],
				questions: [
					{ question: "소주는 넣었나요, 곁들였나요?", answer: "곁들임" },
					{ question: "몇 분 쪘나요?", answer: "" },
				],
			})}`,
			sessionId: null,
		});
		expect(brief.recipe).toBe("꽃게 2마리\n1. 파 마늘 볶기");
		const text = briefText(brief);
		expect(text).toContain("A. 곁들임");
		expect(text).not.toContain("몇 분 쪘나요");
		expect(text).not.toContain("강조 포인트");
	});

	test("레시피도 진행도 없으면 실패한다", () => {
		expect(() => parseBrief({ output: '{"title":"x"}', sessionId: null })).toThrow();
	});
});
