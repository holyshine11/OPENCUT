import { describe, expect, test } from "bun:test";
import { type ChapterCue, formatChapters, proposeChapters } from "../chapters";

/** 주제마다 다른 낱말로 문장을 만든다. 한 자막은 5초, 문장으로 끝난다 */
function talk({ topics, perTopic = 8 }: { topics: string[][]; perTopic?: number }): ChapterCue[] {
	return topics.flatMap((words, t) =>
		Array.from({ length: perTopic }, (_, k) => {
			const start = (t * perTopic + k) * 5;
			const lead = k === 0 && t > 0 ? "이제 " : "";
			return { start, end: start + 4.5, text: `${lead}${words[k % words.length]}을 ${words[(k + 1) % words.length]}에 넣어요.` };
		}),
	);
}

describe("proposeChapters", () => {
	const topics = [
		["등뼈", "핏물", "냄비", "데침"],
		["콩물", "믹서", "두부", "체망"],
		["수제비", "반죽", "밀가루", "숟가락"],
		["시식", "국물", "고소함", "건더기"],
	];

	test("낱말이 바뀌는 곳을 챕터 경계로 잡고 첫 챕터는 0:00", () => {
		const chapters = proposeChapters({ cues: talk({ topics }) });
		expect(chapters.map((c) => c.start)).toEqual([0, 40, 80, 120]);
		expect(chapters[1].title).toBe("이제 콩물을 믹서에 넣어요");
	});

	test("자막이 너무 적으면 만들지 않는다", () => {
		expect(proposeChapters({ cues: talk({ topics: [["등뼈", "핏물"]], perTopic: 5 }) })).toEqual([]);
	});
});

describe("formatChapters", () => {
	test("유튜브 설명란 형식으로 쓰고 규칙을 지키면 valid", () => {
		const result = formatChapters({
			chapters: [
				{ start: 0, title: "인트로" },
				{ start: 75.6, title: "콩물" },
				{ start: 3725, title: "시식" },
			],
			duration: 3800,
		});
		expect(result).toEqual({ text: "0:00 인트로\n1:15 콩물\n1:02:05 시식", valid: true });
	});

	test("3개 미만, 0:00이 아닌 시작, 10초보다 짧은 챕터는 invalid", () => {
		const two = [{ start: 0, title: "a" }, { start: 30, title: "b" }];
		const late = [{ start: 5, title: "a" }, { start: 30, title: "b" }, { start: 60, title: "c" }];
		const short = [{ start: 0, title: "a" }, { start: 30, title: "b" }, { start: 35, title: "c" }];
		for (const chapters of [two, late, short]) expect(formatChapters({ chapters, duration: 100 }).valid).toBe(false);
	});
});
