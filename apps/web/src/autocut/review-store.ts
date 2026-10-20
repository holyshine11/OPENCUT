import { create } from "zustand";
import type { EditPoint } from "./edit-points";

interface ReviewState {
	/** 목록이 가리키는 타임라인 클립. 다른 클립을 분석하면 바뀐다 */
	elementId: string | null;
	items: EditPoint[];
	setItems: (params: { elementId: string; items: EditPoint[] }) => void;
	setEnabled: (params: { id: string; enabled: boolean }) => void;
	clear: () => void;
}

// 프로젝트에 저장하지 않는다. 분석 결과가 캐시돼 있어 다시 찾으면 바로 나온다
export const useAutocutReviewStore = create<ReviewState>()((set) => ({
	elementId: null,
	items: [],
	setItems: ({ elementId, items }) => set({ elementId, items }),
	setEnabled: ({ id, enabled }) =>
		set((state) => ({ items: state.items.map((item) => (item.id === id ? { ...item, enabled } : item)) })),
	clear: () => set({ elementId: null, items: [] }),
}));
