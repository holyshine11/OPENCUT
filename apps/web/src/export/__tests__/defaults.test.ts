import { describe, expect, test } from "bun:test";
import { defaultExportFps } from "../defaults";

describe("defaultExportFps", () => {
	test("60fps 영상이 들어간 프로젝트도 기본은 30fps로 내보낸다", () => {
		expect(
			defaultExportFps({ projectFps: { numerator: 60, denominator: 1 } }),
		).toEqual({
			numerator: 30,
			denominator: 1,
		});
	});

	test("30fps 이하 프로젝트는 그 fps를 그대로 쓴다", () => {
		const ntsc = { numerator: 30000, denominator: 1001 };
		expect(defaultExportFps({ projectFps: ntsc })).toEqual(ntsc);
		expect(
			defaultExportFps({ projectFps: { numerator: 24, denominator: 1 } }),
		).toEqual({
			numerator: 24,
			denominator: 1,
		});
	});
});
