import { create } from "zustand";
import type { CutProposal } from "./silence";

/** 문자열 유니언으로 둔다(enum 금지 규칙) */
export type ReviewAction = "keep" | "cut" | "speed";

/** 검토 중인 편집점 하나. 시간은 소스 기준(초) */
export interface ReviewItem extends CutProposal {
	action: ReviewAction;
	/** 배속을 고르면 쓸 값. 처음에는 제안 배속이고, 컷 제안이면 길이로 계산한 값이다 */
	rate: number;
}

interface ReviewState {
	/** 목록이 가리키는 타임라인 클립. 다른 클립을 분석하면 바뀐다 */
	elementId: string | null;
	items: ReviewItem[];
	setItems: (params: { elementId: string; items: ReviewItem[] }) => void;
	updateItem: (params: { id: string; patch: Partial<Pick<ReviewItem, "action" | "rate">> }) => void;
	clear: () => void;
}

// 프로젝트에 저장하지 않는다. 분석 결과가 캐시돼 있어 다시 찾으면 바로 나온다
export const useAutocutReviewStore = create<ReviewState>()((set) => ({
	elementId: null,
	items: [],
	setItems: ({ elementId, items }) => set({ elementId, items }),
	updateItem: ({ id, patch }) =>
		set((state) => ({
			items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
		})),
	clear: () => set({ elementId: null, items: [] }),
}));
