import type { SelectedKeyframeRef } from "@/animation/types";
import type { ElementRef } from "@/timeline/types";

export interface SelectedMaskPointSelection {
	trackId: string;
	elementId: string;
	maskId: string;
	pointIds: string[];
}

/** 마스크 탭이나 프리뷰 핸들로 고른 마스크. Delete 키가 클립 대신 이 마스크를 지운다 */
export interface SelectedMaskRef {
	trackId: string;
	elementId: string;
	maskId: string;
}

export interface EditorSelectionSnapshot {
	selectedElements: ElementRef[];
	selectedKeyframes: SelectedKeyframeRef[];
	keyframeSelectionAnchor: SelectedKeyframeRef | null;
	selectedMaskPoints: SelectedMaskPointSelection | null;
}

export interface EditorSelectionPatch {
	selectedElements?: ElementRef[];
	selectedKeyframes?: SelectedKeyframeRef[];
	keyframeSelectionAnchor?: SelectedKeyframeRef | null;
	selectedMaskPoints?: SelectedMaskPointSelection | null;
}

export type EditorSelectionKind =
	| "mask-points"
	| "mask"
	| "keyframes"
	| "elements";
