import { create } from "zustand";
import { persist } from "zustand/middleware";
import settings from "@/transcription/settings.json";
import type { CaptionLayout } from "@/transcription/types";

export type CaptionForm = keyof typeof settings.captionLayout;

export const RECOMMENDED_CAPTION_LAYOUTS: Record<CaptionForm, CaptionLayout> =
	settings.captionLayout;

/** 세로 화면(9:16 등)은 숏폼, 나머지는 롱폼 기준을 쓴다 */
export function captionFormOf({
	canvasSize,
}: {
	canvasSize: { width: number; height: number };
}): CaptionForm {
	return canvasSize.height > canvasSize.width ? "shortForm" : "longForm";
}

// 버전 1 전에 추천하던 값. 저장된 값이 이것과 같으면 사용자가 고친 게 아니라 옛 추천값이다
const LEGACY_RECOMMENDED_CAPTION_LAYOUTS: Record<CaptionForm, CaptionLayout> = {
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
};

function migrateLayout({
	stored,
	legacy,
	recommended,
}: {
	stored: CaptionLayout | undefined;
	legacy: CaptionLayout;
	recommended: CaptionLayout;
}): CaptionLayout {
	if (!stored) return recommended;
	const pick = <K extends keyof CaptionLayout>(key: K) =>
		stored[key] === legacy[key] ? recommended[key] : stored[key];
	return {
		maxCharsPerLine: pick("maxCharsPerLine"),
		maxLines: pick("maxLines"),
		minDuration: pick("minDuration"),
		maxDuration: pick("maxDuration"),
		stripPunctuation: pick("stripPunctuation"),
	};
}

/** 옛 추천값 그대로인 항목만 새 추천값으로 바꾸고, 사용자가 고친 항목은 둔다 */
export function migrateCaptionLayouts({
	layouts,
}: {
	layouts: Partial<Record<CaptionForm, CaptionLayout>> | undefined;
}): Record<CaptionForm, CaptionLayout> {
	return {
		shortForm: migrateLayout({
			stored: layouts?.shortForm,
			legacy: LEGACY_RECOMMENDED_CAPTION_LAYOUTS.shortForm,
			recommended: RECOMMENDED_CAPTION_LAYOUTS.shortForm,
		}),
		longForm: migrateLayout({
			stored: layouts?.longForm,
			legacy: LEGACY_RECOMMENDED_CAPTION_LAYOUTS.longForm,
			recommended: RECOMMENDED_CAPTION_LAYOUTS.longForm,
		}),
	};
}

// 사용자가 바꾼 줄 나누기 기준. 숏폼·롱폼 따로, 모든 프로젝트 공통이다
interface CaptionLayoutState {
	layouts: Record<CaptionForm, CaptionLayout>;
	setLayout: (params: { form: CaptionForm; layout: CaptionLayout }) => void;
}

export const useCaptionLayouts = create<CaptionLayoutState>()(
	persist(
		(set) => ({
			layouts: RECOMMENDED_CAPTION_LAYOUTS,
			setLayout: ({ form, layout }) =>
				set((state) => ({ layouts: { ...state.layouts, [form]: layout } })),
		}),
		{
			name: "caption-layouts",
			version: 1,
			// 버전 0은 옛 추천값을 저장하고 있을 수 있다
			migrate: (persisted) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 이 스토어가 저장한 값이다
				const state = persisted as Pick<CaptionLayoutState, "layouts">;
				return {
					...state,
					layouts: migrateCaptionLayouts({ layouts: state.layouts }),
				};
			},
		},
	),
);
