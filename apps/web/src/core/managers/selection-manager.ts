import type { EditorCore } from "@/core";
import type { SelectedKeyframeRef } from "@/animation/types";
import type {
	EditorSelectionKind,
	EditorSelectionPatch,
	EditorSelectionSnapshot,
	SelectedMaskPointSelection,
	SelectedMaskRef,
} from "@/selection/editor-selection";
import type { ElementRef } from "@/timeline/types";
import { excludeLockedElements } from "@/timeline/track-capabilities";

export class SelectionManager {
	private selectedElements: ElementRef[] = [];
	private selectedKeyframes: SelectedKeyframeRef[] = [];
	private keyframeSelectionAnchor: SelectedKeyframeRef | null = null;
	private selectedMaskPoints: SelectedMaskPointSelection | null = null;
	// undo 스냅샷에는 넣지 않는다. 클립·키프레임 선택이 바뀌면 함께 풀린다
	private selectedMask: SelectedMaskRef | null = null;
	// 트랙 선택은 클립 선택과 따로 간다. 클립을 골라도 트랙 선택은 그대로 둔다
	private selectedTrackIds: string[] = [];
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	getSelectedElements(): ElementRef[] {
		return this.selectedElements;
	}

	getSelectedKeyframes(): SelectedKeyframeRef[] {
		return this.selectedKeyframes;
	}

	getKeyframeSelectionAnchor(): SelectedKeyframeRef | null {
		return this.keyframeSelectionAnchor;
	}

	getSelectedMaskPointSelection(): SelectedMaskPointSelection | null {
		return this.selectedMaskPoints;
	}

	getSelectedMask(): SelectedMaskRef | null {
		return this.selectedMask;
	}

	setSelectedMask({ mask }: { mask: SelectedMaskRef | null }): void {
		this.selectedMask = mask;
		this.notify();
	}

	getSelectedTrackIds(): string[] {
		return this.selectedTrackIds;
	}

	/** 그냥 누르면 그 트랙 하나만, 보조 키를 누르면 선택에 넣거나 뺀다 */
	selectTrack({
		trackId,
		isMultiKey,
	}: {
		trackId: string;
		isMultiKey: boolean;
	}): void {
		const isSelected = this.selectedTrackIds.includes(trackId);
		if (!isMultiKey) {
			this.setSelectedTrackIds({ trackIds: [trackId] });
		} else if (isSelected) {
			this.setSelectedTrackIds({
				trackIds: this.selectedTrackIds.filter((id) => id !== trackId),
			});
		} else {
			this.setSelectedTrackIds({
				trackIds: [...this.selectedTrackIds, trackId],
			});
		}
	}

	setSelectedTrackIds({ trackIds }: { trackIds: string[] }): void {
		this.selectedTrackIds = trackIds;
		this.notify();
	}

	getActiveSelectionKind(): EditorSelectionKind | null {
		if ((this.selectedMaskPoints?.pointIds.length ?? 0) > 0) {
			return "mask-points";
		}
		if (this.selectedMask) {
			return "mask";
		}
		if (this.selectedKeyframes.length > 0) {
			return "keyframes";
		}
		if (this.selectedElements.length > 0) {
			return "elements";
		}
		return null;
	}

	getSnapshot(): EditorSelectionSnapshot {
		return {
			selectedElements: [...this.selectedElements],
			selectedKeyframes: [...this.selectedKeyframes],
			keyframeSelectionAnchor: this.keyframeSelectionAnchor,
			selectedMaskPoints: this.selectedMaskPoints
				? {
						...this.selectedMaskPoints,
						pointIds: [...this.selectedMaskPoints.pointIds],
					}
				: null,
		};
	}

	setSelectedElements({ elements }: { elements: ElementRef[] }): void {
		this.selectedElements = this.excludeLocked(elements);
		this.selectedKeyframes = [];
		this.keyframeSelectionAnchor = null;
		this.selectedMaskPoints = null;
		this.selectedMask = null;
		this.notify();
	}

	setSelectedKeyframes({
		keyframes,
		anchorKeyframe,
	}: {
		keyframes: SelectedKeyframeRef[];
		anchorKeyframe?: SelectedKeyframeRef | null;
	}): void {
		this.selectedKeyframes = keyframes;
		if (anchorKeyframe !== undefined) {
			this.keyframeSelectionAnchor = anchorKeyframe;
		} else if (keyframes.length === 0) {
			this.keyframeSelectionAnchor = null;
		}
		this.selectedMaskPoints = null;
		if (keyframes.length > 0) this.selectedMask = null;
		this.notify();
	}

	setSelectedMaskPoints({
		selection,
	}: {
		selection: SelectedMaskPointSelection | null;
	}): void {
		this.selectedMaskPoints =
			selection && selection.pointIds.length > 0
				? {
						...selection,
						pointIds: [...selection.pointIds],
					}
				: null;
		this.selectedKeyframes = [];
		this.keyframeSelectionAnchor = null;
		this.notify();
	}

	clearSelection(): void {
		this.selectedElements = [];
		this.selectedKeyframes = [];
		this.keyframeSelectionAnchor = null;
		this.selectedMaskPoints = null;
		this.selectedMask = null;
		this.notify();
	}

	clearKeyframeSelection(): void {
		this.selectedKeyframes = [];
		this.keyframeSelectionAnchor = null;
		this.notify();
	}

	clearMaskPointSelection(): void {
		if (!this.selectedMaskPoints) {
			return;
		}
		this.selectedMaskPoints = null;
		this.notify();
	}

	clearMostSpecificSelection(): boolean {
		const activeSelectionKind = this.getActiveSelectionKind();
		if (activeSelectionKind === "mask-points") {
			this.clearMaskPointSelection();
			return true;
		}
		if (activeSelectionKind === "mask") {
			this.setSelectedMask({ mask: null });
			return true;
		}
		if (activeSelectionKind === "keyframes") {
			this.clearKeyframeSelection();
			return true;
		}
		if (activeSelectionKind === "elements") {
			this.setSelectedElements({ elements: [] });
			return true;
		}
		return false;
	}

	applySelectionPatch({
		patch,
	}: {
		patch: EditorSelectionPatch;
	}): EditorSelectionSnapshot {
		if (patch.selectedElements !== undefined) {
			this.selectedElements = this.excludeLocked(patch.selectedElements);
		}
		if (patch.selectedKeyframes !== undefined) {
			this.selectedKeyframes = [...patch.selectedKeyframes];
		}
		if (patch.keyframeSelectionAnchor !== undefined) {
			this.keyframeSelectionAnchor = patch.keyframeSelectionAnchor;
		}
		if (patch.selectedMaskPoints !== undefined) {
			this.selectedMaskPoints = patch.selectedMaskPoints
				? {
						...patch.selectedMaskPoints,
						pointIds: [...patch.selectedMaskPoints.pointIds],
					}
				: null;
		}
		this.notify();
		return this.getSnapshot();
	}

	restoreSnapshot({ snapshot }: { snapshot: EditorSelectionSnapshot }): void {
		this.selectedMask = null;
		this.selectedElements = [...snapshot.selectedElements];
		this.selectedKeyframes = [...snapshot.selectedKeyframes];
		this.keyframeSelectionAnchor = snapshot.keyframeSelectionAnchor;
		this.selectedMaskPoints = snapshot.selectedMaskPoints
			? {
					...snapshot.selectedMaskPoints,
					pointIds: [...snapshot.selectedMaskPoints.pointIds],
				}
			: null;
		this.notify();
	}

	// 잠긴 트랙의 클립은 클릭·박스·전체 선택 어디로도 선택되지 않는다
	private excludeLocked(elements: readonly ElementRef[]): ElementRef[] {
		const tracks = this.editor.scenes.getActiveSceneOrNull()?.tracks;
		return tracks ? excludeLockedElements({ tracks, elements }) : [...elements];
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
