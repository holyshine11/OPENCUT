import type {
	MouseEvent as ReactMouseEvent,
	PointerEvent as ReactPointerEvent,
} from "react";
import type { MediaAsset } from "@/media/types";
import {
	getVisibleElementsWithBounds,
	type ElementWithBounds,
} from "@/preview/element-bounds";
import {
	getHitElements,
	hitTest,
	resolvePreferredHit,
} from "@/preview/hit-test";
import {
	SNAP_THRESHOLD_SCREEN_PIXELS,
	snapPosition,
	type SnapLine,
} from "@/preview/preview-snap";
import type { TCanvasSize } from "@/project/types";
import { getElementLocalTime } from "@/animation";
import { buildTransformFromParams, type Transform } from "@/rendering";
import { resolveTransformAtTime } from "@/rendering/animation-values";
import { isVisualElement } from "@/timeline/element-utils";
import type {
	ElementRef,
	SceneTracks,
	TextElement,
	TimelineElement,
	TimelineTrack,
	VisualElement,
} from "@/timeline";
import { buildTransformEditUpdates } from "@/timeline/transform-keyframes";
import { mediaTime, type MediaTime } from "@/wasm";

const MIN_DRAG_DISTANCE = 0.5;
const PRIMARY_POINTER_BUTTON = 0;

type Point = { readonly x: number; readonly y: number };

interface CapturedPointerState {
	readonly pointerId: number;
	readonly captureTarget: HTMLElement;
}

interface PendingGesture extends CapturedPointerState {
	readonly kind: "pending";
	readonly origin: Point;
	readonly topmostHit: ElementWithBounds | null;
	readonly selectedHit: ElementWithBounds | null;
	readonly selectedElements: readonly ElementRef[];
	/** Shift·⌘·Ctrl 를 누른 채 눌렀다. 클릭은 선택에 넣고 빼며, 끌기는 기존 선택에 더해 함께 옮긴다 */
	readonly additive: boolean;
}

/** 빈 곳에서 끌어 사각형 안에 걸친 요소를 고른다 */
interface MarqueeGesture extends CapturedPointerState {
	readonly kind: "marquee";
	readonly origin: Point;
	readonly current: Point;
	readonly additive: boolean;
	readonly selectedElements: readonly ElementRef[];
}

export interface MarqueeRect {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

function toMarqueeRect({ a, b }: { a: Point; b: Point }): MarqueeRect {
	return {
		left: Math.min(a.x, b.x),
		top: Math.min(a.y, b.y),
		right: Math.max(a.x, b.x),
		bottom: Math.max(a.y, b.y),
	};
}

interface DragElementSnapshot {
	readonly trackId: string;
	readonly elementId: string;
	readonly initialTransform: Transform;
	readonly initialElement: VisualElement;
	/** 재생 헤드가 클립 밖이면 null. 키프레임 대신 기본값을 옮긴다 */
	readonly localTime: MediaTime | null;
}

interface DraggingGesture extends CapturedPointerState {
	readonly kind: "dragging";
	readonly origin: Point;
	readonly bounds: {
		readonly width: number;
		readonly height: number;
		readonly rotation: number;
	};
	readonly elements: readonly DragElementSnapshot[];
}

type GestureSession =
	| { readonly kind: "idle" }
	| PendingGesture
	| MarqueeGesture
	| DraggingGesture;

const IDLE_GESTURE: GestureSession = { kind: "idle" };

export interface EditingTextState {
	readonly trackId: string;
	readonly elementId: string;
	readonly element: TextElement;
}

export interface PreviewViewportAdapter {
	screenToCanvas: ({
		clientX,
		clientY,
	}: {
		clientX: number;
		clientY: number;
	}) => Point | null;
	screenPixelsToLogicalThreshold: ({
		screenPixels,
	}: {
		screenPixels: number;
	}) => Point;
}

export interface InputAdapter {
	isShiftHeld: () => boolean;
}

export interface SceneReader {
	getTracks: () => SceneTracks;
	getCurrentTime: () => number;
	getMediaAssets: () => MediaAsset[];
	getCanvasSize: () => TCanvasSize;
}

export interface SelectionApi {
	getSelected: () => readonly ElementRef[];
	setSelected: (elements: readonly ElementRef[]) => void;
	clearSelection: () => void;
}

export interface TimelinePreviewUpdate {
	readonly trackId: string;
	readonly elementId: string;
	readonly updates: Partial<TimelineElement>;
}

export interface TimelineOps {
	getElementsWithTracks: ({
		elements,
	}: {
		elements: readonly ElementRef[];
	}) => Array<{ track: TimelineTrack; element: TimelineElement }>;
	previewElements: (updates: readonly TimelinePreviewUpdate[]) => void;
	commitPreview: () => void;
	discardPreview: () => void;
}

export interface PlaybackApi {
	getIsPlaying: () => boolean;
	subscribe: (listener: () => void) => () => void;
}

export interface PreviewOptions {
	isMaskMode: () => boolean;
	onSnapLinesChange?: (lines: SnapLine[]) => void;
}

export interface PreviewInteractionDeps {
	viewport: PreviewViewportAdapter;
	input: InputAdapter;
	scene: SceneReader;
	selection: SelectionApi;
	timeline: TimelineOps;
	playback: PlaybackApi;
	preview: PreviewOptions;
}

export interface PreviewInteractionDepsRef {
	readonly current: PreviewInteractionDeps;
}

function isSameElementRef({
	left,
	right,
}: {
	left: ElementRef;
	right: ElementRef;
}): boolean {
	return left.trackId === right.trackId && left.elementId === right.elementId;
}

function buildDragSelection({
	selectedElements,
	dragTarget,
	additive,
}: {
	selectedElements: readonly ElementRef[];
	dragTarget: ElementWithBounds;
	additive: boolean;
}): ElementRef[] {
	const dragTargetRef = {
		trackId: dragTarget.trackId,
		elementId: dragTarget.elementId,
	};

	if (
		!selectedElements.some((selectedElement) =>
			isSameElementRef({ left: selectedElement, right: dragTargetRef }),
		)
	) {
		return additive ? [dragTargetRef, ...selectedElements] : [dragTargetRef];
	}

	return [
		dragTargetRef,
		...selectedElements.filter(
			(selectedElement) =>
				!isSameElementRef({ left: selectedElement, right: dragTargetRef }),
		),
	];
}

function movedPastDragThreshold({
	current,
	origin,
}: {
	current: Point;
	origin: Point;
}): boolean {
	return (
		Math.abs(current.x - origin.x) > MIN_DRAG_DISTANCE ||
		Math.abs(current.y - origin.y) > MIN_DRAG_DISTANCE
	);
}

function toDragElementSnapshots({
	elementsWithTracks,
	currentTime,
}: {
	elementsWithTracks: Array<{ track: TimelineTrack; element: TimelineElement }>;
	currentTime: number;
}): DragElementSnapshot[] {
	const isVisualTrackedElement = (value: {
		track: TimelineTrack;
		element: TimelineElement;
	}): value is { track: TimelineTrack; element: VisualElement } =>
		isVisualElement(value.element);

	return elementsWithTracks
		.filter(isVisualTrackedElement)
		.map(({ track, element }) => {
			const baseTransform = buildTransformFromParams({ params: element.params });
			const isPlayheadWithinElement =
				currentTime >= element.startTime &&
				currentTime <= element.startTime + element.duration;
			if (!isPlayheadWithinElement) {
				return {
					trackId: track.id,
					elementId: element.id,
					initialTransform: baseTransform,
					initialElement: element,
					localTime: null,
				};
			}

			const localTime = mediaTime({
				ticks: getElementLocalTime({
					timelineTime: currentTime,
					elementStartTime: element.startTime,
					elementDuration: element.duration,
				}),
			});
			return {
				trackId: track.id,
				elementId: element.id,
				// 키프레임이 있으면 지금 화면에 보이는 위치에서 끌기 시작한다
				initialTransform: resolveTransformAtTime({
					baseTransform,
					animations: element.animations,
					localTime,
				}),
				initialElement: element,
				localTime,
			};
		});
}

export class PreviewInteractionController {
	private readonly depsRef: PreviewInteractionDepsRef;
	private readonly subscribers = new Set<() => void>();

	private gesture: GestureSession = IDLE_GESTURE;
	private editingTextState: EditingTextState | null = null;
	private wasPlaying: boolean;
	private unsubscribePlayback: (() => void) | null = null;

	constructor({ depsRef }: { depsRef: PreviewInteractionDepsRef }) {
		this.depsRef = depsRef;
		this.wasPlaying = this.deps.playback.getIsPlaying();

		this.onDoubleClick = this.onDoubleClick.bind(this);
		this.onPointerDown = this.onPointerDown.bind(this);
		this.onPointerMove = this.onPointerMove.bind(this);
		this.onPointerUp = this.onPointerUp.bind(this);
		this.commitTextEdit = this.commitTextEdit.bind(this);
		this.handlePlaybackChange = this.handlePlaybackChange.bind(this);

		this.unsubscribePlayback = this.deps.playback.subscribe(
			this.handlePlaybackChange,
		);
	}

	private get deps(): PreviewInteractionDeps {
		return this.depsRef.current;
	}

	get isDragging(): boolean {
		return this.gesture.kind === "dragging";
	}

	get marqueeRect(): MarqueeRect | null {
		if (this.gesture.kind !== "marquee") return null;
		return toMarqueeRect({ a: this.gesture.origin, b: this.gesture.current });
	}

	get editingText(): EditingTextState | null {
		return this.editingTextState;
	}

	subscribe({ listener }: { listener: () => void }): () => void {
		this.subscribers.add(listener);
		return () => this.subscribers.delete(listener);
	}

	destroy(): void {
		this.unsubscribePlayback?.();
		this.unsubscribePlayback = null;
		this.abortActiveGesture();
		this.editingTextState = null;
		this.subscribers.clear();
	}

	cancel(): void {
		if (this.gesture.kind === "idle") return;
		this.abortActiveGesture();
		this.notify();
	}

	private abortActiveGesture(): void {
		if (this.gesture.kind === "idle") return;

		if (this.gesture.kind === "dragging") {
			this.deps.timeline.discardPreview();
		}

		this.releaseCapturedPointer({ pointerState: this.gesture });
		this.gesture = IDLE_GESTURE;
		this.clearSnapLines();
	}

	commitTextEdit(): void {
		if (!this.editingTextState) return;

		this.editingTextState = null;
		this.deps.timeline.commitPreview();
		this.notify();
	}

	onDoubleClick({ clientX, clientY }: ReactMouseEvent): void {
		if (this.editingTextState || this.deps.preview.isMaskMode()) return;

		const startPos = this.deps.viewport.screenToCanvas({
			clientX,
			clientY,
		});
		if (!startPos) return;

		const hit = hitTest({
			canvasX: startPos.x,
			canvasY: startPos.y,
			elementsWithBounds: this.getVisibleElementsWithBounds(),
		});

		if (!hit || hit.element.type !== "text") return;

		this.editingTextState = {
			trackId: hit.trackId,
			elementId: hit.elementId,
			element: hit.element,
		};
		this.notify();
	}

	onPointerDown({
		clientX,
		clientY,
		currentTarget,
		pointerId,
		button,
		shiftKey,
		metaKey,
		ctrlKey,
	}: ReactPointerEvent): void {
		if (this.editingTextState) return;
		if (this.deps.preview.isMaskMode()) return;
		if (button !== PRIMARY_POINTER_BUTTON) return;

		const startPos = this.deps.viewport.screenToCanvas({
			clientX,
			clientY,
		});
		if (!startPos) return;

		const hits = getHitElements({
			canvasX: startPos.x,
			canvasY: startPos.y,
			elementsWithBounds: this.getVisibleElementsWithBounds(),
		});
		const selectedElements = this.deps.selection.getSelected();

		this.gesture = {
			kind: "pending",
			origin: startPos,
			pointerId,
			captureTarget: currentTarget as HTMLElement,
			topmostHit: hits[0] ?? null,
			selectedHit: resolvePreferredHit({
				hits,
				preferredElements: [...selectedElements],
			}),
			selectedElements,
			additive: shiftKey || metaKey || ctrlKey,
		};

		currentTarget.setPointerCapture(pointerId);
	}

	onPointerMove({ clientX, clientY }: ReactPointerEvent): void {
		const currentPos = this.deps.viewport.screenToCanvas({
			clientX,
			clientY,
		});
		if (!currentPos) return;

		if (this.gesture.kind === "pending") {
			const pending = this.gesture;
			if (
				!movedPastDragThreshold({
					current: currentPos,
					origin: pending.origin,
				})
			) {
				this.clearSnapLines();
				return;
			}

			if (!pending.topmostHit && !pending.selectedHit) {
				this.gesture = {
					kind: "marquee",
					origin: pending.origin,
					current: currentPos,
					pointerId: pending.pointerId,
					captureTarget: pending.captureTarget,
					additive: pending.additive,
					selectedElements: pending.selectedElements,
				};
			} else {
				this.beginDragFromPending({ pending });
			}
		}

		if (this.gesture.kind === "marquee") {
			this.gesture = { ...this.gesture, current: currentPos };
			this.notify();
			return;
		}

		if (this.gesture.kind !== "dragging") return;

		this.updateDragPreview({
			drag: this.gesture,
			currentPos,
		});
	}

	onPointerUp({ type }: ReactPointerEvent): void {
		if (this.gesture.kind === "dragging") {
			const drag = this.gesture;

			if (type === "pointercancel") {
				this.deps.timeline.discardPreview();
			} else {
				this.deps.timeline.commitPreview();
			}

			this.gesture = IDLE_GESTURE;
			this.clearSnapLines();
			this.releaseCapturedPointer({ pointerState: drag });
			this.notify();
			return;
		}

		if (this.gesture.kind === "marquee") {
			const marquee = this.gesture;
			if (type !== "pointercancel") {
				this.selectInMarquee({ marquee });
			}
			this.gesture = IDLE_GESTURE;
			this.releaseCapturedPointer({ pointerState: marquee });
			this.notify();
			return;
		}

		if (this.gesture.kind !== "pending") return;

		const pending = this.gesture;

		if (type !== "pointercancel") {
			const clickTarget = pending.topmostHit;
			if (!clickTarget) {
				if (!pending.additive) this.deps.selection.clearSelection();
			} else if (pending.additive) {
				const clickRef = {
					trackId: clickTarget.trackId,
					elementId: clickTarget.elementId,
				};
				const isSelected = pending.selectedElements.some((selected) =>
					isSameElementRef({ left: selected, right: clickRef }),
				);
				this.deps.selection.setSelected(
					isSelected
						? pending.selectedElements.filter(
								(selected) =>
									!isSameElementRef({ left: selected, right: clickRef }),
							)
						: [...pending.selectedElements, clickRef],
				);
			} else {
				this.deps.selection.setSelected([
					{
						trackId: clickTarget.trackId,
						elementId: clickTarget.elementId,
					},
				]);
			}
		}

		this.gesture = IDLE_GESTURE;
		this.clearSnapLines();
		this.releaseCapturedPointer({ pointerState: pending });
	}

	private selectInMarquee({ marquee }: { marquee: MarqueeGesture }): void {
		const rect = toMarqueeRect({ a: marquee.origin, b: marquee.current });
		const inside = this.getVisibleElementsWithBounds()
			.filter(({ bounds }) => {
				// shortcut: 회전은 무시하고 축 정렬 상자로 겹침을 본다
				const halfW = Math.abs(bounds.width) / 2;
				const halfH = Math.abs(bounds.height) / 2;
				return (
					bounds.cx + halfW >= rect.left &&
					bounds.cx - halfW <= rect.right &&
					bounds.cy + halfH >= rect.top &&
					bounds.cy - halfH <= rect.bottom
				);
			})
			.map(({ trackId, elementId }) => ({ trackId, elementId }));
		const base = marquee.additive
			? marquee.selectedElements.filter(
					(selected) =>
						!inside.some((ref) => isSameElementRef({ left: ref, right: selected })),
				)
			: [];
		const next = [...base, ...inside];
		if (next.length === 0) {
			this.deps.selection.clearSelection();
		} else {
			this.deps.selection.setSelected(next);
		}
	}

	private notify(): void {
		for (const listener of this.subscribers) listener();
	}

	private clearSnapLines(): void {
		this.deps.preview.onSnapLinesChange?.([]);
	}

	private releaseCapturedPointer({
		pointerState,
	}: {
		pointerState: CapturedPointerState | null;
	}): void {
		if (!pointerState) return;

		if (!pointerState.captureTarget.hasPointerCapture(pointerState.pointerId)) {
			return;
		}

		pointerState.captureTarget.releasePointerCapture(pointerState.pointerId);
	}

	private getVisibleElementsWithBounds(): ElementWithBounds[] {
		return getVisibleElementsWithBounds({
			tracks: this.deps.scene.getTracks(),
			currentTime: this.deps.scene.getCurrentTime(),
			canvasSize: this.deps.scene.getCanvasSize(),
			mediaAssets: this.deps.scene.getMediaAssets(),
		});
	}

	private handlePlaybackChange(): void {
		const isPlaying = this.deps.playback.getIsPlaying();
		if (isPlaying && !this.wasPlaying && this.editingTextState) {
			this.commitTextEdit();
		}
		this.wasPlaying = isPlaying;
	}

	private beginDragFromPending({ pending }: { pending: PendingGesture }): void {
		const dragTarget = pending.selectedHit ?? pending.topmostHit;
		if (!dragTarget) {
			this.gesture = IDLE_GESTURE;
			this.clearSnapLines();
			this.releaseCapturedPointer({ pointerState: pending });
			return;
		}

		const dragSelection = buildDragSelection({
			selectedElements: pending.selectedElements,
			dragTarget,
			additive: pending.additive,
		});
		const draggableElements = toDragElementSnapshots({
			elementsWithTracks: this.deps.timeline.getElementsWithTracks({
				elements: dragSelection,
			}),
			currentTime: this.deps.scene.getCurrentTime(),
		});

		if (draggableElements.length === 0) {
			this.gesture = IDLE_GESTURE;
			this.clearSnapLines();
			this.releaseCapturedPointer({ pointerState: pending });
			return;
		}

		if (pending.selectedHit === null) {
			this.deps.selection.setSelected(dragSelection);
		}

		this.gesture = {
			kind: "dragging",
			origin: pending.origin,
			pointerId: pending.pointerId,
			captureTarget: pending.captureTarget,
			bounds: {
				width: dragTarget.bounds.width,
				height: dragTarget.bounds.height,
				rotation: dragTarget.bounds.rotation,
			},
			elements: draggableElements,
		};
		this.notify();
	}

	private updateDragPreview({
		drag,
		currentPos,
	}: {
		drag: DraggingGesture;
		currentPos: Point;
	}): void {
		const firstElement = drag.elements[0];
		if (!firstElement) return;

		const deltaX = currentPos.x - drag.origin.x;
		const deltaY = currentPos.y - drag.origin.y;

		const proposedPosition = {
			x: firstElement.initialTransform.position.x + deltaX,
			y: firstElement.initialTransform.position.y + deltaY,
		};

		const shouldSnap = !this.deps.input.isShiftHeld();
		const snapThreshold = this.deps.viewport.screenPixelsToLogicalThreshold({
			screenPixels: SNAP_THRESHOLD_SCREEN_PIXELS,
		});
		const { snappedPosition, activeLines } = shouldSnap
			? snapPosition({
					proposedPosition,
					canvasSize: this.deps.scene.getCanvasSize(),
					elementSize: drag.bounds,
					rotation: drag.bounds.rotation,
					snapThreshold,
				})
			: {
					snappedPosition: proposedPosition,
					activeLines: [] as SnapLine[],
				};

		this.deps.preview.onSnapLinesChange?.(activeLines);

		const deltaSnappedX =
			snappedPosition.x - firstElement.initialTransform.position.x;
		const deltaSnappedY =
			snappedPosition.y - firstElement.initialTransform.position.y;

		this.deps.timeline.previewElements(
			drag.elements.map(
				({ trackId, elementId, initialTransform, initialElement, localTime }) => ({
					trackId,
					elementId,
					updates: buildTransformEditUpdates({
						element: initialElement,
						localTime,
						values: {
							"transform.positionX": initialTransform.position.x + deltaSnappedX,
							"transform.positionY": initialTransform.position.y + deltaSnappedY,
						},
					}),
				}),
			),
		);
	}
}
