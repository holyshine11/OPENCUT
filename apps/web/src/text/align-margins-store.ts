import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AlignMargins } from "./align-clips";

/** 캔버스 px. 1080p 기준 화면 가장자리에서 살짝 띄운 안전 여백 */
export const DEFAULT_ALIGN_MARGIN = 60;
export const DEFAULT_ALIGN_MARGINS: AlignMargins = {
	top: DEFAULT_ALIGN_MARGIN,
	right: DEFAULT_ALIGN_MARGIN,
	bottom: DEFAULT_ALIGN_MARGIN,
	left: DEFAULT_ALIGN_MARGIN,
};
export const DEFAULT_DISTRIBUTE_GAP = 20;

interface AlignMarginsState {
	margins: AlignMargins;
	gap: number;
	setMargin: (args: { side: keyof AlignMargins; value: number }) => void;
	resetMargins: () => void;
	setGap: (args: { gap: number }) => void;
}

// 한 번 정한 여백·간격은 다음 자막·다음 프로젝트에서도 그대로 쓴다
export const useAlignMarginsStore = create<AlignMarginsState>()(
	persist(
		(set) => ({
			margins: DEFAULT_ALIGN_MARGINS,
			gap: DEFAULT_DISTRIBUTE_GAP,
			setMargin: ({ side, value }) =>
				set((state) => ({ margins: { ...state.margins, [side]: value } })),
			resetMargins: () => set({ margins: DEFAULT_ALIGN_MARGINS }),
			setGap: ({ gap }) => set({ gap }),
		}),
		{ name: "text-align-margins" },
	),
);
