import type { TimelineTrack, TimelineElement } from "@/timeline";
import type { ComputeDropTargetParams, DropTarget } from "@/timeline";
import { resolveTrackPlacement } from "@/timeline/placement";
import {
	getTrackFolderRows,
	type TrackFolderRow,
} from "@/timeline/track-folders";
import {
	getCumulativeHeightBefore,
	getTrackHeight,
	getTrackRowLayouts,
} from "./track-layout";
import {
	mediaTime,
	type MediaTime,
	roundMediaTime,
	TICKS_PER_SECOND,
} from "@/wasm";

function findElementAtPosition({
	mouseX,
	tracks,
	trackIndex,
	targetElementTypes,
	pixelsPerSecond,
	zoomLevel,
}: {
	mouseX: number;
	tracks: TimelineTrack[];
	trackIndex: number;
	targetElementTypes: string[];
	pixelsPerSecond: number;
	zoomLevel: number;
}): { elementId: string; trackId: string } | null {
	const time = mediaTime({
		ticks: Math.round(
			(mouseX / (pixelsPerSecond * zoomLevel)) * TICKS_PER_SECOND,
		),
	});
	const track = tracks[trackIndex];
	if (!track || !("elements" in track)) return null;

	const hit = track.elements.find(
		(element: TimelineElement) =>
			targetElementTypes.includes(element.type) &&
			element.startTime <= time &&
			time < element.startTime + element.duration,
	);
	if (!hit) return null;
	return { elementId: hit.id, trackId: track.id };
}

function getTrackAtY({
	mouseY,
	tracks,
	folderRows,
	verticalDragDirection,
}: {
	mouseY: number;
	tracks: TimelineTrack[];
	folderRows: readonly TrackFolderRow[];
	verticalDragDirection?: "up" | "down" | null;
}): { trackIndex: number; relativeY: number } | null {
	const { rows } = getTrackRowLayouts({ tracks, folderRows });
	let previous: number | null = null;

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (row.hidden) continue;

		// 앞 줄과 이 줄 사이 틈(폴더 머리 줄 포함)
		const gapTop =
			previous === null ? 0 : rows[previous].top + rows[previous].height;
		if (mouseY >= gapTop && mouseY < row.top) {
			if (previous !== null && verticalDragDirection) {
				const isDraggingUp = verticalDragDirection === "up";
				return {
					trackIndex: isDraggingUp ? previous : i,
					relativeY: isDraggingUp ? rows[previous].height - 1 : 0,
				};
			}
			if (row.folderHeaderTop !== null) {
				return { trackIndex: i, relativeY: 0 };
			}
		}

		if (mouseY >= row.top && mouseY < row.top + row.height) {
			return { trackIndex: i, relativeY: mouseY - row.top };
		}
		previous = i;
	}

	return null;
}

const EMPTY_TARGET_ELEMENT = null;

function fallbackNewTrackDropTarget({
	xPosition,
}: {
	xPosition: MediaTime;
}): DropTarget {
	return {
		trackIndex: 0,
		isNewTrack: true,
		insertPosition: null,
		xPosition,
		targetElement: EMPTY_TARGET_ELEMENT,
	};
}

export function computeDropTarget({
	elementType,
	mouseX,
	mouseY,
	tracks,
	playheadTime,
	isExternalDrop,
	elementDuration,
	pixelsPerSecond,
	zoomLevel,
	verticalDragDirection,
	startTimeOverride,
	excludeElementId,
	targetElementTypes,
	trackFolders,
}: ComputeDropTargetParams): DropTarget {
	const orderedTracks = tracks;
	const xPosition =
		startTimeOverride !== undefined
			? startTimeOverride
			: isExternalDrop
				? playheadTime
				: mediaTime({
						ticks: Math.round(
							Math.max(0, mouseX / (pixelsPerSecond * zoomLevel)) *
								TICKS_PER_SECOND,
						),
					});

	if (orderedTracks.length === 0) {
		const placementResult = resolveTrackPlacement({
			tracks,
			elementType,
			timeSpans: [
				{ startTime: xPosition, duration: elementDuration, excludeElementId },
			],
			strategy: {
				type: "preferIndex",
				trackIndex: 0,
				hoverDirection: "below",
				createNewTrackOnly: true,
			},
		});
		const emptyTimelineResult =
			placementResult?.kind === "newTrack" ? placementResult : null;
		if (!emptyTimelineResult) {
			return fallbackNewTrackDropTarget({ xPosition });
		}

		return {
			trackIndex: emptyTimelineResult.insertIndex,
			isNewTrack: true,
			insertPosition: emptyTimelineResult.insertPosition,
			xPosition,
			targetElement: EMPTY_TARGET_ELEMENT,
		};
	}

	const trackAtMouse = getTrackAtY({
		mouseY,
		tracks: orderedTracks,
		folderRows: getTrackFolderRows({
			tracks: orderedTracks,
			folders: trackFolders,
		}),
		verticalDragDirection,
	});

	if (!trackAtMouse) {
		const isAboveAllTracks = mouseY < 0;

		const placementResult = resolveTrackPlacement({
			tracks,
			elementType,
			timeSpans: [
				{ startTime: xPosition, duration: elementDuration, excludeElementId },
			],
			strategy: {
				type: "preferIndex",
				trackIndex: isAboveAllTracks ? 0 : orderedTracks.length - 1,
				hoverDirection: isAboveAllTracks ? "above" : "below",
				createNewTrackOnly: true,
			},
		});
		const outOfBoundsResult =
			placementResult?.kind === "newTrack" ? placementResult : null;
		if (!outOfBoundsResult) {
			return fallbackNewTrackDropTarget({ xPosition });
		}

		return {
			trackIndex: outOfBoundsResult.insertIndex,
			isNewTrack: true,
			insertPosition: outOfBoundsResult.insertPosition,
			xPosition,
			targetElement: EMPTY_TARGET_ELEMENT,
		};
	}

	const { trackIndex, relativeY } = trackAtMouse;
	const track = orderedTracks[trackIndex];

	if (targetElementTypes && targetElementTypes.length > 0) {
		const targetElement = findElementAtPosition({
			mouseX,
			tracks: orderedTracks,
			trackIndex,
			targetElementTypes,
			pixelsPerSecond,
			zoomLevel,
		});
		if (targetElement) {
			return {
				trackIndex,
				isNewTrack: false,
				insertPosition: null,
				xPosition,
				targetElement,
			};
		}
	}

	const trackHeight = getTrackHeight({ type: track.type });
	const placementResult = resolveTrackPlacement({
		tracks,
		elementType,
		timeSpans: [
			{ startTime: xPosition, duration: elementDuration, excludeElementId },
		],
		strategy: {
			type: "preferIndex",
			trackIndex,
			hoverDirection: relativeY < trackHeight / 2 ? "above" : "below",
			verticalDragDirection,
		},
	});
	if (!placementResult) {
		return fallbackNewTrackDropTarget({ xPosition });
	}

	if (placementResult.kind === "existingTrack") {
		const adjustedXPosition =
			placementResult.adjustedStartTime !== undefined
				? roundMediaTime({ time: placementResult.adjustedStartTime })
				: xPosition;

		return {
			trackIndex: placementResult.trackIndex,
			isNewTrack: false,
			insertPosition: null,
			xPosition: adjustedXPosition,
			targetElement: EMPTY_TARGET_ELEMENT,
		};
	}

	return {
		trackIndex: placementResult.insertIndex,
		isNewTrack: true,
		insertPosition: placementResult.insertPosition,
		xPosition,
		targetElement: EMPTY_TARGET_ELEMENT,
	};
}

export function getDropLineY({
	dropTarget,
	tracks,
	folderRows,
}: {
	dropTarget: DropTarget;
	tracks: TimelineTrack[];
	folderRows?: readonly TrackFolderRow[];
}): number {
	const safeTrackIndex = Math.max(dropTarget.trackIndex, 0);
	return getCumulativeHeightBefore({
		tracks,
		trackIndex: safeTrackIndex,
		folderRows,
	});
}
