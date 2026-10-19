import { describe, expect, test } from "bun:test";
import { defaultExportFps, fitInside, youtubeExportSize } from "../defaults";

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

describe("youtubeExportSize", () => {
	test("세로 캔버스는 숏폼 1080×1920, 가로·정사각형은 롱폼 1920×1080", () => {
		expect(youtubeExportSize({ canvasSize: { width: 720, height: 1280 } })).toEqual({
			width: 1080,
			height: 1920,
		});
		expect(youtubeExportSize({ canvasSize: { width: 1280, height: 720 } })).toEqual({
			width: 1920,
			height: 1080,
		});
		expect(youtubeExportSize({ canvasSize: { width: 1080, height: 1080 } })).toEqual({
			width: 1920,
			height: 1080,
		});
	});
});

describe("fitInside", () => {
	test("비율이 같으면 꽉 채운다", () => {
		expect(
			fitInside({ source: { width: 720, height: 1280 }, target: { width: 1080, height: 1920 } }),
		).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
	});

	test("정사각형은 가로 화면 가운데에 놓고 양옆을 비운다", () => {
		expect(
			fitInside({ source: { width: 1080, height: 1080 }, target: { width: 1920, height: 1080 } }),
		).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
	});
});
