import { describe, expect, test } from "bun:test";
import { sheetGrid } from "../frames";

describe("sheetGrid", () => {
	test("세로 영상은 옆으로 많이, 가로 영상은 아래로 많이 놓는다", () => {
		expect(sheetGrid({ count: 12, width: 270, height: 480 }).columns).toBe(4);
		expect(sheetGrid({ count: 12, width: 853, height: 480 }).columns).toBe(3);
	});

	test("시트가 한 변 1536px을 넘지 않고, 프레임을 키우지는 않는다", () => {
		for (const [width, height] of [
			[270, 480],
			[853, 480],
			[480, 480],
		]) {
			for (const count of [1, 2, 7, 12]) {
				const { columns, scale } = sheetGrid({ count, width, height });
				const rows = Math.ceil(count / columns);
				expect(scale).toBeLessThanOrEqual(1);
				expect(scale).toBeGreaterThan(0);
				expect(columns * width * scale).toBeLessThanOrEqual(1536);
				expect(rows * (height * scale + 22)).toBeLessThanOrEqual(1536.001);
			}
		}
	});
});
