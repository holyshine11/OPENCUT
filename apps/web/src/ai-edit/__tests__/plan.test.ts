import { describe, expect, test } from "bun:test";
import { parsePlan, placeBeats } from "../plan";

const durations = { c01: 10, c02: 4 };

describe("parsePlan", () => {
	test("설명이 섞여 있어도 JSON을 꺼내고 구간을 클립 안으로 자른다", () => {
		const plan = parsePlan({
			durations,
			output: `[5/5] 검토 끝\n${JSON.stringify({
				concept: "컨셉",
				hook: "훅",
				look: "food",
				beats: [
					{ clip: "c01", start: -1, end: 3, narration: " 가 ", caption: "나", transition: "dissolve" },
					{ clip: "c02", start: 2, end: 99, narration: "", caption: "", transition: "wipe" },
					{ clip: "c09", start: 0, end: 2 },
					{ clip: "c01", start: 5, end: 5.1 },
				],
				youtube: { title: "제목", description: "설명", tags: ["a", 3] },
				review: ["확인"],
			})}`,
		});
		expect(plan.beats).toEqual([
			{ clip: "c01", start: 0, end: 3, narration: "가", caption: "나", transition: "dissolve" },
			{ clip: "c02", start: 2, end: 4, narration: "", caption: "", transition: null },
		]);
		expect(plan.look).toBe("food");
		expect(plan.youtube.tags).toEqual(["a"]);
	});

	test("쓸 컷이 없으면 던진다", () => {
		expect(() => parsePlan({ durations, output: '{"beats":[]}' })).toThrow();
		expect(() => parsePlan({ durations, output: "죄송합니다" })).toThrow();
	});
});

describe("placeBeats", () => {
	const beat = ({ clip, start, end }: { clip: string; start: number; end: number }) => ({
		clip,
		start,
		end,
		narration: "",
		caption: "",
		transition: null,
	});

	test("내레이션이 길면 컷을 늘리고, 원본이 모자라면 다음 음성을 미룬다", () => {
		const placed = placeBeats({
			beats: [
				beat({ clip: "c01", start: 0, end: 2 }),
				beat({ clip: "c02", start: 3, end: 4 }),
				beat({ clip: "c01", start: 4, end: 6 }),
			],
			voices: [3, 2, null],
			durations,
			pause: 0.5,
		});
		// 첫 컷: 음성 3초 + 쉼 0.5초만큼 늘어난다
		expect(placed[0]).toEqual({ at: 0, length: 3.5, voiceAt: 0 });
		// 둘째 컷: 원본이 1초뿐이라 못 늘리고 음성은 컷 시작부터 나온다
		expect(placed[1]).toEqual({ at: 3.5, length: 1, voiceAt: 3.5 });
		// 셋째 컷: 음성이 없다
		expect(placed[2]).toEqual({ at: 4.5, length: 2, voiceAt: null });
	});

	test("앞 음성이 아직 나오는 중이면 다음 음성은 그 뒤에 시작한다", () => {
		const placed = placeBeats({
			beats: [beat({ clip: "c02", start: 3, end: 4 }), beat({ clip: "c01", start: 0, end: 2 })],
			voices: [2, 1],
			durations,
			pause: 0,
		});
		expect(placed[1].voiceAt).toBe(2);
		expect(placed[1].length).toBe(2);
	});
});
