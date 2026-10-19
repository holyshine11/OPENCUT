import { describe, expect, test } from "bun:test";
import {
	clampCueTiming,
	formatCueTime,
	mergeCues,
	parseCueTime,
	planReplaceAll,
	splitCue,
	splitIndexAtTime,
} from "../edit";

describe("splitCue", () => {
	test("커서 위치에서 나누고 시간은 공백을 뺀 글자 수 비율로 나눈다", () => {
		// 앞 4글자, 뒤 4글자 → 절반씩
		expect(
			splitCue({
				cue: { text: "국밥 맛집 오늘 최고", start: 10, end: 14 },
				at: 5,
			}),
		).toEqual([
			{ text: "국밥 맛집", start: 10, end: 12 },
			{ text: "오늘 최고", start: 12, end: 14 },
		]);
	});

	test("커서가 맨 앞이나 맨 뒤면 나누지 않는다", () => {
		const cue = { text: "국밥", start: 0, end: 1 };
		expect(splitCue({ cue, at: 0 })).toBeNull();
		expect(splitCue({ cue, at: 2 })).toBeNull();
	});

	test("단어 시간이 있으면 나눈 단어가 실제로 시작한 때에서 가른다", () => {
		expect(
			splitCue({
				cue: {
					text: "국밥 맛집 오늘 최고",
					start: 10,
					end: 14,
					wordStarts: [10, 10.4, 13, 13.5],
				},
				at: 5,
			}),
		).toEqual([
			{ text: "국밥 맛집", start: 10, end: 13, wordStarts: [10, 10.4] },
			{ text: "오늘 최고", start: 13, end: 14, wordStarts: [13, 13.5] },
		]);
	});

	test("문구를 고쳐 단어 수가 달라졌거나 단어 중간에서 나누면 글자 비율로 나눈다", () => {
		const wordStarts = [10, 10.4, 13, 13.5];
		expect(
			splitCue({
				cue: { text: "국밥 맛집 최고", start: 10, end: 14, wordStarts },
				at: 5,
			})?.[0],
		).toEqual({ text: "국밥 맛집", start: 10, end: 10 + (4 * 4) / 6 });
		expect(
			splitCue({
				cue: { text: "국밥 맛집 오늘 최고", start: 10, end: 14, wordStarts },
				at: 4,
			})?.[0],
		).toEqual({ text: "국밥 맛", start: 10, end: 11.5 });
	});
});

describe("splitCue time", () => {
	const cue = {
		text: "국밥 맛집 오늘 최고",
		start: 10,
		end: 14,
		wordStarts: [10, 10.4, 13, 13.5],
	};

	test("시각을 주면 그 시각에서 나누고 단어 시각은 단어 경계대로 나눈다", () => {
		expect(splitCue({ cue, at: 5, time: 12.8 })).toEqual([
			{ text: "국밥 맛집", start: 10, end: 12.8, wordStarts: [10, 10.4] },
			{ text: "오늘 최고", start: 12.8, end: 14, wordStarts: [13, 13.5] },
		]);
	});

	test("시각이 자막 범위 밖이면 나누지 않는다", () => {
		expect(splitCue({ cue, at: 5, time: 14 })).toBeNull();
		expect(splitCue({ cue, at: 5, time: 9 })).toBeNull();
	});
});

describe("splitIndexAtTime", () => {
	test("단어 시각이 있으면 시작 시각이 가장 가까운 단어 앞에서 가른다", () => {
		const cue = {
			text: "국밥 맛집 오늘 최고",
			start: 10,
			end: 14,
			wordStarts: [10, 10.4, 13, 13.5],
		};
		expect(splitIndexAtTime({ cue, time: 12.8 })).toBe(6);
		expect(splitIndexAtTime({ cue, time: 10.5 })).toBe(3);
		expect(splitIndexAtTime({ cue, time: 13.9 })).toBe(9);
	});

	test("단어 시각이 없으면 글자 비율로 가장 가까운 단어 앞에서 가른다", () => {
		// 글자 8개, 12초는 4글자 지점 → "오늘" 앞
		const cue = { text: "국밥 맛집 오늘 최고", start: 10, end: 14 };
		expect(splitIndexAtTime({ cue, time: 12 })).toBe(6);
		expect(splitIndexAtTime({ cue, time: 10.2 })).toBe(3);
	});

	test("단어가 하나뿐이면 가를 곳이 없다", () => {
		expect(
			splitIndexAtTime({ cue: { text: "국밥", start: 0, end: 1 }, time: 0.5 }),
		).toBeNull();
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

	test("둘 다 단어 시간이 있으면 이어 붙이고, 하나라도 없으면 버린다", () => {
		expect(
			mergeCues({
				first: { text: "오늘은", start: 1, end: 2, wordStarts: [1] },
				second: { text: "국밥", start: 2.5, end: 3.5, wordStarts: [2.5] },
			}).wordStarts,
		).toEqual([1, 2.5]);
		expect(
			mergeCues({
				first: { text: "오늘은", start: 1, end: 2, wordStarts: [1] },
				second: { text: "국밥", start: 2.5, end: 3.5 },
			}).wordStarts,
		).toBeUndefined();
	});
});

describe("clampCueTiming", () => {
	test("이웃 자막과 겹치지 않게 시작·끝을 조인다", () => {
		expect(
			clampCueTiming({ start: 0.5, end: 4, previousEnd: 1, nextStart: 3 }),
		).toEqual({ start: 1, end: 3 });
	});

	test("끝이 시작보다 앞서면 고칠 수 없다", () => {
		expect(
			clampCueTiming({ start: 3, end: 2, previousEnd: 0, nextStart: null }),
		).toBeNull();
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

describe("planReplaceAll", () => {
	test("검색어가 들어 있는 자막만 바꾼 텍스트로 돌려준다", () => {
		expect(
			planReplaceAll({
				cues: [
					{ id: "a", text: "요스를 붓고 요스를 끓여요" },
					{ id: "b", text: "국밥" },
					{ id: "c", text: "진한 요스" },
				],
				query: "요스",
				replacement: "육수",
			}),
		).toEqual([
			{ id: "a", text: "육수를 붓고 육수를 끓여요" },
			{ id: "c", text: "진한 육수" },
		]);
	});

	test("빈 검색어는 아무것도 바꾸지 않는다", () => {
		expect(
			planReplaceAll({
				cues: [{ id: "a", text: "국밥" }],
				query: "",
				replacement: "x",
			}),
		).toEqual([]);
	});
});
