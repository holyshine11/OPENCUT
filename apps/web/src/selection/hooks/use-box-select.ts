"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
	BoxSelectionSnapshot,
	ResolveIntersections,
	SelectionBoxBounds,
} from "@/selection/types";

interface SelectionBoxState<TId> extends BoxSelectionSnapshot<TId> {
	startPos: { x: number; y: number };
	currentPos: { x: number; y: number };
	bounds: SelectionBoxBounds | null;
	isActive: boolean;
	isAdditive: boolean;
}

function getSelectionBoxBounds({
	container,
	startPos,
	currentPos,
}: {
	container: HTMLElement;
	startPos: { x: number; y: number };
	currentPos: { x: number; y: number };
}): SelectionBoxBounds {
	const containerRect = container.getBoundingClientRect();
	const startX = startPos.x - containerRect.left;
	const startY = startPos.y - containerRect.top;
	const currentX = currentPos.x - containerRect.left;
	const currentY = currentPos.y - containerRect.top;

	return {
		left: Math.min(startX, currentX),
		top: Math.min(startY, currentY),
		width: Math.abs(currentX - startX),
		height: Math.abs(currentY - startY),
	};
}

export function useBoxSelect<TId>({
	containerRef,
	resolveIntersections,
	selectedIds,
	anchorId,
	onSelectionChange,
	shouldStartSelection,
	getIsAdditiveSelection,
	isEnabled = true,
}: {
	containerRef: React.RefObject<HTMLElement | null>;
	resolveIntersections: ResolveIntersections<TId>;
	selectedIds: TId[];
	anchorId: TId | null;
	onSelectionChange: (state: {
		intersectedIds: TId[];
		initialSelectedIds: TId[];
		initialAnchorId: TId | null;
		isAdditive: boolean;
	}) => void;
	shouldStartSelection?: (event: React.MouseEvent<Element>) => boolean;
	getIsAdditiveSelection?: (event: React.MouseEvent<Element>) => boolean;
	isEnabled?: boolean;
}) {
	const [selectionBox, setSelectionBox] =
		useState<SelectionBoxState<TId> | null>(null);
	const justFinishedSelectingRef = useRef(false);
	// cancel() 직후 같은 프레임의 mousemove가 상자를 되살리지 않게 한다
	const isTrackingRef = useRef(false);

	const handleMouseDown = useCallback(
		(event: React.MouseEvent<Element>) => {
			const canStartSelection = shouldStartSelection
				? shouldStartSelection(event)
				: true;
			if (!isEnabled || event.button !== 0 || !canStartSelection) {
				return;
			}

			const startPos = { x: event.clientX, y: event.clientY };
			const container = containerRef.current;
			isTrackingRef.current = true;
			setSelectionBox({
				startPos,
				currentPos: startPos,
				bounds: container
					? getSelectionBoxBounds({
							container,
							startPos,
							currentPos: startPos,
						})
					: null,
				isActive: false,
				isAdditive: getIsAdditiveSelection
					? getIsAdditiveSelection(event)
					: event.ctrlKey || event.metaKey,
				initialSelectedIds: selectedIds,
				initialAnchorId: anchorId,
			});
		},
		[
			anchorId,
			containerRef,
			getIsAdditiveSelection,
			isEnabled,
			selectedIds,
			shouldStartSelection,
		],
	);

	const updateSelection = useCallback(
		({
			startPos,
			currentPos,
			isAdditive,
			initialSelectedIds,
			initialAnchorId,
		}: SelectionBoxState<TId>) => {
			const intersectedIds = resolveIntersections({
				startPos,
				currentPos,
			});
			onSelectionChange({
				intersectedIds,
				initialSelectedIds,
				initialAnchorId,
				isAdditive,
			});
		},
		[onSelectionChange, resolveIntersections],
	);

	useEffect(() => {
		if (!selectionBox) {
			return;
		}

		const handleMouseMove = ({ clientX, clientY, buttons }: MouseEvent) => {
			// 버튼을 뗐는데 mouseup을 못 받은 경우(포인터 가로채기 등) 상자가 따라다니지 않게 끝낸다
			if (!isTrackingRef.current) return;
			if ((buttons & 1) === 0) {
				isTrackingRef.current = false;
				setSelectionBox(null);
				return;
			}
			const currentPos = { x: clientX, y: clientY };
			const deltaX = Math.abs(clientX - selectionBox.startPos.x);
			const deltaY = Math.abs(clientY - selectionBox.startPos.y);
			const container = containerRef.current;
			const nextSelectionBox = {
				...selectionBox,
				currentPos,
				bounds: container
					? getSelectionBoxBounds({
							container,
							startPos: selectionBox.startPos,
							currentPos,
						})
					: null,
				isActive: deltaX > 5 || deltaY > 5 || selectionBox.isActive,
			};

			setSelectionBox(nextSelectionBox);

			if (!nextSelectionBox.isActive) {
				return;
			}

			updateSelection(nextSelectionBox);
		};

		const handleMouseUp = () => {
			isTrackingRef.current = false;
			if (selectionBox.isActive) {
				justFinishedSelectingRef.current = true;
				requestAnimationFrame(() => {
					justFinishedSelectingRef.current = false;
				});
			}

			setSelectionBox(null);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [containerRef, selectionBox, updateSelection]);

	useEffect(() => {
		if (!selectionBox) {
			return;
		}

		const container = containerRef.current;
		const previousBodyUserSelect = document.body.style.userSelect;
		const previousContainerUserSelect = container?.style.userSelect ?? "";

		document.body.style.userSelect = "none";
		if (container) {
			container.style.userSelect = "none";
		}

		return () => {
			document.body.style.userSelect = previousBodyUserSelect;
			if (container) {
				container.style.userSelect = previousContainerUserSelect;
			}
		};
	}, [containerRef, selectionBox]);

	const cancel = useCallback(() => {
		isTrackingRef.current = false;
		setSelectionBox(null);
	}, []);

	const shouldIgnoreClick = useCallback(() => {
		return justFinishedSelectingRef.current;
	}, []);

	return {
		selectionBox:
			selectionBox?.isActive && selectionBox.bounds
				? { bounds: selectionBox.bounds }
				: null,
		handleMouseDown,
		isSelecting: selectionBox?.isActive ?? false,
		shouldIgnoreClick,
		cancel,
	};
}
