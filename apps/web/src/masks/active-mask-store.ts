import { create } from "zustand";
import type { Mask } from "@/masks/types";

/** 마스크 탭에서 펼친 마스크. 프리뷰 핸들도 이 마스크를 따라간다 */
interface ActiveMaskState {
	activeMaskId: string | null;
	setActiveMaskId: (maskId: string | null) => void;
}

export const useActiveMaskStore = create<ActiveMaskState>()((set) => ({
	activeMaskId: null,
	setActiveMaskId: (activeMaskId) => set({ activeMaskId }),
}));

/** 고른 마스크가 목록에 없으면(다른 클립을 골랐거나 지워졌으면) 마지막 마스크를 쓴다 */
export function resolveActiveMask({
	masks,
	activeMaskId,
}: {
	masks: Mask[];
	activeMaskId: string | null;
}): Mask | null {
	return (
		masks.find((mask) => mask.id === activeMaskId) ?? masks.at(-1) ?? null
	);
}
