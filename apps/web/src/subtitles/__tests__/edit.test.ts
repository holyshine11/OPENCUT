import { describe, expect, test } from "bun:test";
import { clampCueTiming, formatCueTime, mergeCues, parseCueTime, splitCue } from "../edit";

describe("splitCue", () => {
	test("커서 위치에서 나누고 시간은 공백을 뺀 글자 수 비율로 나눈다", () => {
		// 앞 4글자, 뒤 4글자 → 절반씩
		expect(splitCue({ cue: { text: "국밥 맛집 오늘 최고", start: 10, end: 14 }, at: 5 })).toEqual([
			{ text: "국밥 맛집", start: 10, end: 12 },
			{ text: "오늘 최고", start: 12, end: 14 },
		]);
	});

	test("커서가 맨 앞이나 맨 뒤면 나누지 않는다", () => {
		const cue = { text: "국밥", start: 0, end: 1 };
		expect(splitCue({ cue, at: 0 })).toBeNull();
		expect(splitCue({ cue, at: 2 })).toBeNull();
	});
});

describe("mergeCues", () => {
	test("다음 자막과 합치면 텍스트를 이어 붙이고 앞 자막 시작부터 뒤 자막 끝까지 덮는다", () => {
		expect(
			mergeCues({
				first: { text: "오늘은", start: 1, end: 2 },
				second: { text: "국밥", start: 2.5, end: 3.5 },
			}),
		).toEqual({ text: "오늘은 국밥", start: 1, end: 3.5 });
	});
});

describe("clampCueTiming", () => {
	test("이웃 자막과 겹치지 않게 시작·끝을 조인다", () => {
		expect(
			clampCueTiming({ start: 0.5, end: 4, previousEnd: 1, nextStart: 3 }),
		).toEqual({ start: 1, end: 3 });
	});

	test("끝이 시작보다 앞서면 고칠 수 없다", () => {
		expect(clampCueTiming({ start: 3, end: 2, previousEnd: 0, nextStart: null })).toBeNull();
	});
});

describe("parseCueTime / formatCueTime", () => {
	test("분:초.소수와 초만 쓴 입력을 모두 읽는다", () => {
		expect(parseCueTime({ input: "1:02.5" })).toBe(62.5);
		expect(parseCueTime({ input: "62.5" })).toBe(62.5);
		expect(parseCueTime({ input: "1:2" })).toBeNull();
		expect(parseCueTime({ input: "abc" })).toBeNull();
	});

	test("목록에는 분:초.한자리로 보여 준다", () => {
		expect(formatCueTime({ seconds: 62.54 })).toBe("1:02.5");
		expect(formatCueTime({ seconds: 3 })).toBe("0:03.0");
	});
});
