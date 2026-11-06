import { create } from "zustand";

/**
 * 프리뷰에서 글자를 직접 고치는 중인 텍스트 클립. 편집 오버레이는 애니메이션 없는 자리에 커서를 두므로
 * 렌더러도 이 클립은 애니메이션을 끄고 그린다
 */
export const useTextEditingStore = create<{ elementId: string | null }>(() => ({
	elementId: null,
}));

export function setEditingTextElementId({ elementId }: { elementId: string | null }): void {
	useTextEditingStore.setState({ elementId });
}
