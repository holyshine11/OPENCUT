import { describe, expect, test } from "bun:test";
import { compareFileNames } from "../filename-order";

describe("compareFileNames", () => {
	test("숫자 → 대문자 → 소문자 → 한글, 숫자는 값 순서", () => {
		const names = ["가.mp4", "b.mp4", "B.mp4", "10.mp4", "2.mp4", "1.mp4", "a.mp4", "A.mp4", "나.mp4"];
		expect([...names].sort(compareFileNames)).toEqual([
			"1.mp4", "2.mp4", "10.mp4", "A.mp4", "B.mp4", "a.mp4", "b.mp4", "가.mp4", "나.mp4",
		]);
	});
	test("날짜형 파일명", () => {
		expect(["20261031_161851.mp4", "20261031_161754.mp4"].sort(compareFileNames)).toEqual([
			"20261031_161754.mp4", "20261031_161851.mp4",
		]);
	});
});
