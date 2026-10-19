import { describe, expect, test } from "bun:test";
import { FONT_SIZE_SCALE_REFERENCE } from "@/text/typography";
import settings from "../settings.json";
import {
	RECOMMENDED_CAPTION_LAYOUTS,
	migrateCaptionLayouts,
} from "../caption-layout-store";

function fontPx({
	form,
	height,
}: {
	form: "shortForm" | "longForm";
	height: number;
}) {
	return (settings.captionFontSize[form] * height) / FONT_SIZE_SCALE_REFERENCE;
}

describe("형식별 자막 기본값", () => {
	test("롱폼은 1줄 24자, 1920×1080에서 60px", () => {
		expect(RECOMMENDED_CAPTION_LAYOUTS.longForm).toMatchObject({
			maxLines: 1,
			maxCharsPerLine: 24,
		});
		expect(fontPx({ form: "longForm", height: 1080 })).toBe(60);
	});

	test("숏폼은 1줄 12자, 1080×1920에서 80px", () => {
		expect(RECOMMENDED_CAPTION_LAYOUTS.shortForm).toMatchObject({
			maxLines: 1,
			maxCharsPerLine: 12,
		});
		expect(fontPx({ form: "shortForm", height: 1920 })).toBe(80);
	});
});

describe("migrateCaptionLayouts", () => {
	test("옛 추천값 그대로 저장된 값은 새 추천값이 된다", () => {
		const migrated = migrateCaptionLayouts({
			layouts: {
				shortForm: {
					maxCharsPerLine: 14,
					maxLines: 1,
					minDuration: 0.6,
					maxDuration: 3,
					stripPunctuation: true,
				},
				longForm: {
					maxCharsPerLine: 22,
					maxLines: 2,
					minDuration: 1,
					maxDuration: 6,
					stripPunctuation: false,
				},
			},
		});
		expect(migrated).toEqual(RECOMMENDED_CAPTION_LAYOUTS);
	});

	test("사용자가 고친 항목은 그대로 두고 나머지만 바꾼다", () => {
		const migrated = migrateCaptionLayouts({
			layouts: {
				shortForm: {
					maxCharsPerLine: 16,
					maxLines: 1,
					minDuration: 0.6,
					maxDuration: 3,
					stripPunctuation: true,
				},
				longForm: {
					maxCharsPerLine: 22,
					maxLines: 3,
					minDuration: 1,
					maxDuration: 6,
					stripPunctuation: false,
				},
			},
		});
		expect(migrated.shortForm.maxCharsPerLine).toBe(16);
		expect(migrated.longForm).toEqual({
			...RECOMMENDED_CAPTION_LAYOUTS.longForm,
			maxLines: 3,
		});
	});

	test("저장된 값이 없으면 추천값을 쓴다", () => {
		expect(migrateCaptionLayouts({ layouts: undefined })).toEqual(
			RECOMMENDED_CAPTION_LAYOUTS,
		);
	});
});
