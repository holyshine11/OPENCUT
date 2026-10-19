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
		{ name: "caption-layouts" },
	),
);
