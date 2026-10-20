"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { isSpaceHeld, setPanning } from "@/timeline/space-pan";
import {
	ArrowDown01Icon,
	ArrowRight01Icon,
	Delete02Icon,
	FolderAddIcon,
	FolderRemoveIcon,
	LockIcon,
	MagicWand05Icon,
	PaintBoardIcon,
	MusicNote03Icon,
	PencilEdit01Icon,
	SquareUnlock02Icon,
	TaskAdd02Icon,
	TextIcon,
	ViewIcon,
	ViewOffSlashIcon,
	VolumeHighIcon,
	VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { OcShapesIcon, OcVideoIcon } from "@/components/icons";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useTimelineZoom } from "@/timeline/hooks/use-timeline-zoom";
import {
	useCallback,
	useEffect,
	useMemo,
	Fragment,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { useContainerSize } from "@/hooks/use-container-size";
import type { MediaTime } from "@/wasm";
import type { ElementDragView, DropTarget } from "@/timeline";
import { TimelineTrackContent } from "./timeline-track";
import { TimelinePlayhead } from "./timeline-playhead";
import { SelectionBox } from "@/selection/selection-box";
import { useBoxSelect } from "@/selection/hooks/use-box-select";
import { SnapIndicator } from "./snap-indicator";
import type { SnapPoint } from "@/timeline/snapping";
import type { TimelineTrack, TrackFolder } from "@/timeline";
import {
	TIMELINE_SCROLLBAR_SIZE_PX,
	TIMELINE_CONTENT_TOP_PADDING_PX,
	TIMELINE_TRACK_GAP_PX,
	TIMELINE_TRACK_HEIGHT_STEP_PX,
	TIMELINE_TRACK_LABELS_COLUMN_WIDTH_PX,
	TIMELINE_FOLDER_HEADER_HEIGHT_PX,
	KEYFRAME_LANE_HEIGHT_PX,
} from "./layout";
import { useElementInteraction } from "@/timeline/hooks/element/use-element-interaction";
import {
	canTrackHaveAudio,
	canTrackBeHidden,
	getTimelineZoomMin,
	getTimelinePaddingPx,
} from "@/timeline";
import { timelineTimeToPixels } from "@/timeline/pixel-utils";
import {
	clampTrackHeight,
	getTrackHeight,
	getTotalTracksHeight,
	getTrackRowLayouts,
} from "./track-layout";
import {
	getFolderToggleState,
	getGroupableTrackIds,
	getTrackFolderRows,
	type TrackFolderRow,
} from "@/timeline/track-folders";
import {
	getTrackColor,
	LOCKED_TRACK_OVERLAY_CLASS,
	PICKED_TRACK_ROW_CLASS,
	SELECTED_TRACK_ROW_CLASS,
} from "./theme";
import { TIMELINE_LAYERS } from "./layers";
import {
	computeTrackExpansionHeight,
	getTrackExpandedRows,
	getPropertyLabel,
	type ExpandedRow,
} from "./expanded-layout";
import { TIMELINE_HORIZONTAL_WHEEL_STEP_PX } from "./interaction";
import { TimelineToolbar } from "./timeline-toolbar";
import { MasterMeterColumn } from "./audio-mixer";
import {
	AnchoredColorPopover,
	ColorStrip,
	TrackColorStrip,
} from "./timeline-color-popover";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { useTimelineSeek } from "@/timeline/hooks/use-timeline-seek";
import { useTimelineDragDrop } from "@/timeline/hooks/use-timeline-drag-drop";
import { TimelineRuler } from "./timeline-ruler";
import {
	TimelineBookmarksRow,
	useBookmarkDrag,
} from "@/timeline/bookmarks/index";
import { useEdgeAutoScroll } from "@/timeline/hooks/use-edge-auto-scroll";
import { useInitialScrollBottom } from "@/timeline/hooks/use-initial-scroll-bottom";
import { useTimelineResize } from "@/timeline/hooks/use-timeline-resize";
import { useTimelineStore } from "@/timeline/timeline-store";
import { useEditor } from "@/editor/use-editor";
import { useScrollPosition } from "@/timeline/hooks/use-scroll-position";
import { useTimelinePlayhead } from "@/timeline/hooks/use-timeline-playhead";
import { DragLine } from "./drag-line";
import { invokeAction } from "@/actions";
import { useActionHandler } from "@/actions/use-action-handler";
import { resolveTimelineElementIntersections } from "./selection-hit-testing";
import { cn } from "@/utils/ui";
import { translateLabel, useMessages } from "@/i18n";
import { ActionTooltip } from "@/actions/components/action-tooltip";
import { DEFAULT_TRACK_NAMES } from "@/timeline/tracks";
import { insertCaptionAt } from "@/subtitles/insert";
import { useTrackReorderDrag } from "@/timeline/hooks/use-track-reorder-drag";

const TRACKS_CONTAINER_MAX_HEIGHT = 800;
const FALLBACK_CONTAINER_WIDTH = 1000;
const TRACKS_CONTAINER_HEIGHT = { min: 0, max: TRACKS_CONTAINER_MAX_HEIGHT };
const TRACK_ICONS: Record<TimelineTrack["type"], ReactNode> = {
	video: <OcVideoIcon className="text-muted-foreground size-4 shrink-0" />,
	text: (
		<HugeiconsIcon
			icon={TextIcon}
			className="text-muted-foreground size-4 shrink-0"
		/>
	),
	audio: (
		<HugeiconsIcon
			icon={MusicNote03Icon}
			className="text-muted-foreground size-4 shrink-0"
		/>
	),
	graphic: <OcShapesIcon className="text-muted-foreground size-4 shrink-0" />,
	effect: (
		<HugeiconsIcon
			icon={MagicWand05Icon}
			className="text-muted-foreground size-4 shrink-0"
		/>
	),
};

export function Timeline() {
	const m = useMessages();
	const snappingEnabled = useTimelineStore((s) => s.snappingEnabled);
	const {
		selectedElements,
		clearElementSelection,
		setElementSelection,
		mergeElementsIntoSelection,
	} = useElementSelection();
	const editor = useEditor();
	const timeline = editor.timeline;
	const scene = useEditor((currentEditor) =>
		currentEditor.scenes.getActiveSceneOrNull(),
	);
	const tracks = useMemo<TimelineTrack[]>(
		() => (scene ? scene.tracks : []),
		[scene],
	);
	const folderRows = useMemo(
		() => getTrackFolderRows({ tracks, folders: scene?.trackFolders }),
		[tracks, scene],
	);
	const seek = (time: MediaTime) => editor.playback.seek({ time });

	const timelineRef = useRef<HTMLDivElement>(null);
	const timelineHeaderRef = useRef<HTMLDivElement>(null);
	const rulerRef = useRef<HTMLDivElement>(null);
	const rulerScrollRef = useRef<HTMLDivElement>(null);
	const tracksContainerRef = useRef<HTMLDivElement>(null);
	const tracksScrollRef = useRef<HTMLDivElement>(null);
	const trackLabelsRef = useRef<HTMLDivElement>(null);
	const playheadRef = useRef<HTMLDivElement>(null);
	const trackLabelsScrollRef = useRef<HTMLDivElement>(null);

	const [currentSnapPoint, setCurrentSnapPoint] = useState<SnapPoint | null>(
		null,
	);
	const { width: tracksContainerWidth } = useContainerSize({
		containerRef: tracksContainerRef,
	});
	const { height: timelineHeaderHeightValue } = useContainerSize({
		containerRef: timelineHeaderRef,
	});
	const { viewportWidth: tracksViewportWidth } = useScrollPosition({
		scrollRef: tracksScrollRef,
	});

	const handleSnapPointChange = useCallback((snapPoint: SnapPoint | null) => {
		setCurrentSnapPoint(snapPoint);
	}, []);

	const timelineDuration = timeline.getTotalDuration() || 0;
	const containerWidth = tracksContainerWidth || FALLBACK_CONTAINER_WIDTH;
	const minZoomLevel = getTimelineZoomMin({
		duration: timelineDuration,
		containerWidth,
	});

	const savedViewState = editor.project.getTimelineViewState();

	const { zoomLevel, setZoomLevel, handleWheel, saveScrollPosition } =
		useTimelineZoom({
			containerRef: timelineRef,
			minZoom: minZoomLevel,
			initialZoom: savedViewState?.zoomLevel,
			initialScrollLeft: savedViewState?.scrollLeft,
			initialPlayheadTime: savedViewState?.playheadTime,
			tracksScrollRef,
			rulerScrollRef,
		});
	const { isResizing, handleResizeStart } = useTimelineResize({
		zoomLevel,
		onSnapPointChange: handleSnapPointChange,
	});

	const expandedElementIds = useTimelineStore((s) => s.expandedElementIds);

	const getTrackExpansionHeight = useCallback(
		(trackIndex: number) => {
			const track = tracks[trackIndex];
			if (!track) return 0;
			return computeTrackExpansionHeight({ track, expandedElementIds });
		},
		[tracks, expandedElementIds],
	);

	// Stable refs so the wheel listener never goes stale
	const setZoomLevelRef = useRef(setZoomLevel);
	useEffect(() => {
		setZoomLevelRef.current = setZoomLevel;
	}, [setZoomLevel]);

	const saveScrollPositionRef = useRef(saveScrollPosition);
	useEffect(() => {
		saveScrollPositionRef.current = saveScrollPosition;
	}, [saveScrollPosition]);

	const minZoomLevelRef = useRef(minZoomLevel);
	useEffect(() => {
		minZoomLevelRef.current = minZoomLevel;
	}, [minZoomLevel]);

	// Pushes tracks scroll position to the two overflow:hidden followers
	// (ruler and track labels). Called from the wheel handler (before paint,
	// zero lag) and from onScroll on the tracks area (covers scrollbar drag).
	const syncFollowers = useCallback(() => {
		const tracks = tracksScrollRef.current;
		if (!tracks) return;
		if (rulerScrollRef.current) {
			rulerScrollRef.current.scrollLeft = tracks.scrollLeft;
		}
		if (trackLabelsScrollRef.current) {
			trackLabelsScrollRef.current.scrollTop = tracks.scrollTop;
		}
	}, []);

	// Single non-passive capture listener owns all wheel input. Prevents any
	// native scroll or browser zoom from firing inside the timeline.
	useEffect(() => {
		const container = timelineRef.current;
		if (!container) return;

		let pendingZoomDelta = 0;
		let zoomRafId: ReturnType<typeof requestAnimationFrame> | null = null;

		const onWheel = (e: WheelEvent) => {
			const isZoom = e.ctrlKey || e.metaKey;

			if (isZoom) {
				e.preventDefault();
				const normalizedDelta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
				pendingZoomDelta += normalizedDelta;

				if (zoomRafId === null) {
					zoomRafId = requestAnimationFrame(() => {
						const frameRawDelta = pendingZoomDelta;
						const cappedDelta =
							Math.sign(frameRawDelta) * Math.min(Math.abs(frameRawDelta), 30);
						const zoomFactor = Math.exp(-cappedDelta / 300);
						setZoomLevelRef.current((prev) => prev * zoomFactor);
						pendingZoomDelta = 0;
						zoomRafId = null;
					});
				}
				return;
			}

			const tracks = tracksScrollRef.current;
			if (!tracks) return;

			const isHorizontal =
				e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);

			e.preventDefault();

			if (isHorizontal) {
				const raw =
					Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
				const clamped =
					Math.sign(raw) *
					Math.min(Math.abs(raw), TIMELINE_HORIZONTAL_WHEEL_STEP_PX);
				tracks.scrollLeft = Math.max(0, tracks.scrollLeft + clamped);
			} else {
				tracks.scrollTop = Math.max(0, tracks.scrollTop + e.deltaY);
			}

			syncFollowers();
			saveScrollPositionRef.current();
		};

		container.addEventListener("wheel", onWheel, {
			passive: false,
			capture: true,
		});
		return () => {
			container.removeEventListener("wheel", onWheel, { capture: true });
			if (zoomRafId !== null) cancelAnimationFrame(zoomRafId);
		};
	}, [syncFollowers]);

	// Space+드래그 또는 휠 클릭 드래그로 화면만 옮긴다. 재생 헤드 시점은 그대로.
	// 캡처 단계에서 가로채 클립 선택·이동·탐색이 같이 일어나지 않게 한다
	useEffect(() => {
		const container = timelineRef.current;
		if (!container) return;

		let drag: {
			pointerId: number;
			x: number;
			y: number;
			left: number;
			top: number;
		} | null = null;
		let suppressClick = false;

		const onPointerDown = (e: PointerEvent) => {
			const isPan = e.button === 1 || (e.button === 0 && isSpaceHeld());
			const tracks = tracksScrollRef.current;
			if (!isPan || !tracks) return;
			e.preventDefault();
			e.stopPropagation();
			container.setPointerCapture(e.pointerId);
			drag = {
				pointerId: e.pointerId,
				x: e.clientX,
				y: e.clientY,
				left: tracks.scrollLeft,
				top: tracks.scrollTop,
			};
			suppressClick = true;
			setPanning(true);
		};

		const onPointerMove = (e: PointerEvent) => {
			const tracks = tracksScrollRef.current;
			if (!drag || e.pointerId !== drag.pointerId || !tracks) return;
			e.stopPropagation();
			tracks.scrollLeft = Math.max(0, drag.left - (e.clientX - drag.x));
			tracks.scrollTop = Math.max(0, drag.top - (e.clientY - drag.y));
			syncFollowers();
		};

		const onPointerUp = (e: PointerEvent) => {
			if (!drag || e.pointerId !== drag.pointerId) return;
			e.stopPropagation();
			drag = null;
			setPanning(false);
			saveScrollPositionRef.current();
			// 끌기 직후 click이 안 오는 경우(다른 요소에서 뗌)에 다음 진짜 클릭까지 삼키지 않게
			setTimeout(() => {
				suppressClick = false;
			});
		};

		// 드래그 뒤 따라오는 click이 재생 헤드 이동이나 선택 해제로 이어지지 않게 한 번 삼킨다
		const onClick = (e: MouseEvent) => {
			if (!suppressClick) return;
			suppressClick = false;
			e.stopPropagation();
			e.preventDefault();
		};
		const onAuxClick = (e: MouseEvent) => {
			if (e.button === 1) onClick(e);
		};

		const options = { capture: true };
		container.addEventListener("pointerdown", onPointerDown, options);
		container.addEventListener("pointermove", onPointerMove, options);
		container.addEventListener("pointerup", onPointerUp, options);
		container.addEventListener("pointercancel", onPointerUp, options);
		container.addEventListener("click", onClick, options);
		container.addEventListener("auxclick", onAuxClick, options);
		return () => {
			container.removeEventListener("pointerdown", onPointerDown, options);
			container.removeEventListener("pointermove", onPointerMove, options);
			container.removeEventListener("pointerup", onPointerUp, options);
			container.removeEventListener("pointercancel", onPointerUp, options);
			container.removeEventListener("click", onClick, options);
			container.removeEventListener("auxclick", onAuxClick, options);
		};
	}, [syncFollowers]);

	useInitialScrollBottom({
		tracksScrollRef,
		trackLabelsScrollRef,
		onAfterScroll: () => saveScrollPositionRef.current(),
		isReady: tracks.length > 0,
	});

	const { dragView, handleElementMouseDown, handleElementClick } =
		useElementInteraction({
			zoomLevel,
			tracksContainerRef,
			tracksScrollRef,
			snappingEnabled,
			onSnapPointChange: handleSnapPointChange,
		});
	const isElementDragging = dragView.kind === "dragging";

	const {
		dragState: bookmarkDragState,
		handleBookmarkMouseDown,
		lastMouseXRef: bookmarkLastMouseXRef,
	} = useBookmarkDrag({
		zoomLevel,
		scrollRef: tracksScrollRef,
		snappingEnabled,
		onSnapPointChange: handleSnapPointChange,
	});

	const { handleRulerMouseDown: handlePlayheadRulerMouseDown } =
		useTimelinePlayhead({
			zoomLevel,
			rulerRef,
			rulerScrollRef,
			tracksScrollRef,
			playheadRef,
		});

	const { isDragOver, dropTarget, dragProps } = useTimelineDragDrop({
		containerRef: tracksContainerRef,
		tracksScrollRef,
		zoomLevel,
	});

	const {
		selectionBox,
		handleMouseDown: handleSelectionMouseDown,
		isSelecting,
		shouldIgnoreClick,
	} = useBoxSelect({
		containerRef: tracksContainerRef,
		selectedIds: selectedElements,
		anchorId: null,
		getIsAdditiveSelection: (event) =>
			event.shiftKey || event.ctrlKey || event.metaKey,
		resolveIntersections: ({ startPos, currentPos }) => {
			if (!tracksContainerRef.current) {
				return [];
			}

			return resolveTimelineElementIntersections({
				container: tracksContainerRef.current,
				scrollContainer: tracksScrollRef.current,
				tracks,
				folderRows,
				zoomLevel,
				startPos,
				currentPos,
			});
		},
		onSelectionChange: ({ intersectedIds, isAdditive }) => {
			if (isAdditive) {
				mergeElementsIntoSelection({ elements: intersectedIds });
			} else {
				setElementSelection({ elements: intersectedIds });
			}
		},
	});

	const contentWidth = timelineTimeToPixels({
		time: timelineDuration,
		zoomLevel,
	});
	const paddingPx = getTimelinePaddingPx({
		containerWidth,
		zoomLevel,
		minZoom: minZoomLevel,
	});
	const dynamicTimelineWidth = Math.max(
		contentWidth + paddingPx,
		containerWidth,
	);
	const hasHorizontalScrollbar =
		dynamicTimelineWidth > (tracksViewportWidth || containerWidth);

	useEdgeAutoScroll({
		isActive: bookmarkDragState.isDragging,
		getMouseClientX: () => bookmarkLastMouseXRef.current,
		rulerScrollRef,
		tracksScrollRef,
		contentWidth: dynamicTimelineWidth,
	});

	useEdgeAutoScroll({
		isActive: isElementDragging,
		getMouseClientX: () =>
			dragView.kind === "dragging" ? dragView.currentMouseX : 0,
		rulerScrollRef,
		tracksScrollRef,
		contentWidth: dynamicTimelineWidth,
	});

	const showSnapIndicator =
		snappingEnabled &&
		currentSnapPoint !== null &&
		(isElementDragging || bookmarkDragState.isDragging || isResizing);

	const {
		handleTracksMouseDown,
		handleTracksClick,
		handleRulerMouseDown,
		handleRulerClick,
	} = useTimelineSeek({
		playheadRef,
		trackLabelsRef,
		rulerScrollRef,
		tracksScrollRef,
		zoomLevel,
		duration: timeline.getTotalDuration(),
		isSelecting,
		clearSelectedElements: clearElementSelection,
		seek,
	});

	const timelineHeaderHeight =
		timelineHeaderHeightValue + TIMELINE_CONTENT_TOP_PADDING_PX;

	return (
		<section
			className={
				"panel bg-background relative flex h-full flex-col overflow-hidden rounded-sm border"
			}
			{...dragProps}
			aria-label={m.timeline.title}
		>
			<TimelineToolbar
				zoomLevel={zoomLevel}
				minZoom={minZoomLevel}
				setZoomLevel={({ zoom }) => setZoomLevel(zoom)}
			/>

			<div
				className="relative flex flex-1 overflow-hidden"
				ref={timelineRef}
				data-timeline-pan-surface
			>
				<TrackLabelsPanel
					trackLabelsRef={trackLabelsRef}
					trackLabelsScrollRef={trackLabelsScrollRef}
					timelineHeaderHeight={timelineHeaderHeight}
					hasHorizontalScrollbar={hasHorizontalScrollbar}
					getTrackExpansionHeight={getTrackExpansionHeight}
					folderRows={folderRows}
				/>

				<div
					className="relative isolate flex flex-1 flex-col overflow-hidden"
					ref={tracksContainerRef}
				>
					<SelectionBox bounds={selectionBox?.bounds ?? null} />
					<DragLine
						dropTarget={dropTarget}
						tracks={tracks}
						folderRows={folderRows}
						isVisible={isDragOver && !dropTarget?.targetElement}
						headerHeight={timelineHeaderHeight}
					/>
					<DragLine
						dropTarget={isElementDragging ? dragView.dropTarget : null}
						tracks={tracks}
						folderRows={folderRows}
						isVisible={isElementDragging}
						headerHeight={timelineHeaderHeight}
					/>

					<div ref={rulerScrollRef} className="shrink-0 overflow-hidden">
						<div
							ref={timelineHeaderRef}
							className="flex flex-col"
							style={{ width: `${dynamicTimelineWidth}px` }}
						>
							<TimelineRuler
								zoomLevel={zoomLevel}
								dynamicTimelineWidth={dynamicTimelineWidth}
								rulerRef={rulerRef}
								tracksScrollRef={rulerScrollRef}
								handleWheel={handleWheel}
								handleTimelineContentClick={handleRulerClick}
								handleRulerTrackingMouseDown={handleRulerMouseDown}
								handleRulerMouseDown={handlePlayheadRulerMouseDown}
							/>
							<TimelineBookmarksRow
								zoomLevel={zoomLevel}
								dynamicTimelineWidth={dynamicTimelineWidth}
								dragState={bookmarkDragState}
								onBookmarkMouseDown={handleBookmarkMouseDown}
								handleWheel={handleWheel}
								handleTimelineContentClick={handleRulerClick}
								handleRulerTrackingMouseDown={handleRulerMouseDown}
								handleRulerMouseDown={handlePlayheadRulerMouseDown}
							/>
						</div>
					</div>

					<ScrollArea
						className="flex-1"
						ref={tracksScrollRef}
						onScroll={() => {
							syncFollowers();
							saveScrollPosition();
						}}
					>
						<div
							className="flex min-h-full flex-col"
							style={{ width: `${dynamicTimelineWidth}px` }}
						>
							{/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- spatial gesture surface (tracks container background); direct-target clicks here originate box-select or clear selection. Keyboard control is global timeline shortcuts. */}
							<div
								className="relative shrink-0"
								style={{
									height: `${
										Math.max(
											TRACKS_CONTAINER_HEIGHT.min,
											Math.min(
												TRACKS_CONTAINER_HEIGHT.max,
												getTotalTracksHeight({
													tracks,
													getExtraHeight: getTrackExpansionHeight,
													folderRows,
												}),
											),
										) + TIMELINE_CONTENT_TOP_PADDING_PX
									}px`,
								}}
								onMouseDown={(event) => {
									const isDirectTarget = event.target === event.currentTarget;
									if (!isDirectTarget) return;
									event.stopPropagation();
									handleTracksMouseDown(event);
									handleSelectionMouseDown(event);
								}}
								onClick={(event) => {
									const isDirectTarget = event.target === event.currentTarget;
									if (!isDirectTarget) return;
									event.stopPropagation();
									handleTracksClick(event);
									editor.selection.setSelectedTrackIds({ trackIds: [] });
								}}
							>
								{tracks.length > 0 && (
									<TimelineTrackRows
										zoomLevel={zoomLevel}
										dragView={dragView}
										onResizeStart={handleResizeStart}
										onElementMouseDown={handleElementMouseDown}
										onElementClick={handleElementClick}
										onTrackMouseDown={(event) => {
											handleSelectionMouseDown(event);
											handleTracksMouseDown(event);
										}}
										onTrackMouseUp={handleTracksClick}
										shouldIgnoreClick={shouldIgnoreClick}
										isDragOver={isDragOver}
										dropTarget={dropTarget}
										folderRows={folderRows}
									/>
								)}
							</div>
							<TimelineGutter
								onMouseDown={(event) => {
									handleTracksMouseDown(event);
									handleSelectionMouseDown(event);
								}}
								onClick={(event) => {
									handleTracksClick(event);
									editor.selection.setSelectedTrackIds({ trackIds: [] });
								}}
							/>
						</div>
					</ScrollArea>

					<TimelinePlayhead
						zoomLevel={zoomLevel}
						hasHorizontalScrollbar={hasHorizontalScrollbar}
						rulerRef={rulerRef}
						rulerScrollRef={rulerScrollRef}
						tracksScrollRef={tracksScrollRef}
						timelineRef={timelineRef}
						playheadRef={playheadRef}
						isSnappingToPlayhead={
							showSnapIndicator && currentSnapPoint?.type === "playhead"
						}
					/>
				</div>
				<SnapIndicator
					snapPoint={currentSnapPoint}
					zoomLevel={zoomLevel}
					timelineRef={timelineRef}
					tracksScrollRef={tracksScrollRef}
					isVisible={showSnapIndicator}
				/>
				<MasterMeterColumn />
			</div>
		</section>
	);
}

function TrackLabelsPanel({
	trackLabelsRef,
	trackLabelsScrollRef,
	timelineHeaderHeight,
	hasHorizontalScrollbar,
	getTrackExpansionHeight,
	folderRows,
}: {
	trackLabelsRef: React.RefObject<HTMLDivElement | null>;
	trackLabelsScrollRef: React.RefObject<HTMLDivElement | null>;
	timelineHeaderHeight: number;
	hasHorizontalScrollbar: boolean;
	getTrackExpansionHeight: (trackIndex: number) => number;
	folderRows: readonly TrackFolderRow[];
}) {
	const editor = useEditor();
	const m = useMessages();
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const tracks = useMemo<TimelineTrack[]>(
		() => (scene ? scene.tracks : []),
		[scene],
	);
	const { selectedElements } = useElementSelection();
	const tracksWithSelection = useMemo(
		() => new Set(selectedElements.map((el) => el.trackId)),
		[selectedElements],
	);
	const pickedTrackIds = useEditor((e) => e.selection.getSelectedTrackIds());
	const [renamingTrackId, setRenamingTrackId] = useState<string | null>(null);
	const trackListRef = useRef<HTMLDivElement>(null);
	const trackZones = useMemo(
		() => (scene ? [scene.tracks.map(({ id }) => id)] : []),
		[scene],
	);
	const reorder = useTrackReorderDrag({
		listRef: trackListRef,
		zones: trackZones,
		onMove: ({ trackId, toIndex }) =>
			editor.timeline.moveTrack({ trackId, toIndex }),
	});

	// 고른 트랙이 없으면 모든 트랙
	const stepTrackHeights = (delta: number) =>
		editor.timeline.resizeTracks({
			trackIds:
				pickedTrackIds.length > 0 ? pickedTrackIds : tracks.map(({ id }) => id),
			getHeight: (track) => clampTrackHeight(getTrackHeight(track) + delta),
		});
	useActionHandler(
		"track-height-increase",
		() => stepTrackHeights(TIMELINE_TRACK_HEIGHT_STEP_PX),
		undefined,
	);
	useActionHandler(
		"track-height-decrease",
		() => stepTrackHeights(-TIMELINE_TRACK_HEIGHT_STEP_PX),
		undefined,
	);

	/** 헤더 위·아래 끝을 끌어 높이를 바꾼다. 고른 트랙을 끌면 고른 트랙이 함께 바뀐다 */
	const startTrackResize = ({
		event,
		trackId,
		edge,
	}: {
		event: React.PointerEvent<HTMLDivElement>;
		trackId: string;
		edge: "top" | "bottom";
	}) => {
		event.preventDefault();
		event.stopPropagation();
		const handle = event.currentTarget;
		handle.setPointerCapture(event.pointerId);
		const before = tracks;
		const trackIds = pickedTrackIds.includes(trackId)
			? pickedTrackIds
			: [trackId];
		const startHeights = new Map(
			before.map((track) => [track.id, getTrackHeight(track)]),
		);
		const startY = event.clientY;
		// 위 끝은 위로 끌수록 커진다
		const direction = edge === "top" ? -1 : 1;
		let moved = false;
		const resize = ({
			clientY,
			preview,
		}: {
			clientY: number;
			preview: boolean;
		}) =>
			editor.timeline.resizeTracks({
				trackIds,
				preview,
				getHeight: (track) =>
					clampTrackHeight(
						(startHeights.get(track.id) ?? getTrackHeight(track)) +
							direction * (clientY - startY),
					),
			});
		const onMove = (moveEvent: PointerEvent) => {
			moved = true;
			resize({ clientY: moveEvent.clientY, preview: true });
		};
		const onEnd = (endEvent: PointerEvent) => {
			handle.removeEventListener("pointermove", onMove);
			handle.removeEventListener("pointerup", onEnd);
			handle.removeEventListener("pointercancel", onEnd);
			if (!moved) return;
			// 끄는 동안 바꾼 값을 되돌리고 실행 취소 기록 하나로 다시 적용한다
			editor.timeline.updateTracks(before);
			if (endEvent.type === "pointerup") {
				resize({ clientY: endEvent.clientY, preview: false });
			}
		};
		handle.addEventListener("pointermove", onMove);
		handle.addEventListener("pointerup", onEnd);
		handle.addEventListener("pointercancel", onEnd);
	};

	const expandedElementIds = useTimelineStore((s) => s.expandedElementIds);
	const trackExpandedRowsMap = useMemo(
		() =>
			tracks.map((track) =>
				getTrackExpandedRows({ track, expandedElementIds }),
			),
		[tracks, expandedElementIds],
	);

	return (
		<div
			className="flex shrink-0 flex-col border-r"
			style={{ width: `${TIMELINE_TRACK_LABELS_COLUMN_WIDTH_PX}px` }}
		>
			<div
				className="shrink-0"
				style={{ height: timelineHeaderHeight || 48 }}
			/>
			<div ref={trackLabelsRef} className="flex-1 overflow-hidden">
				<div ref={trackLabelsScrollRef} className="size-full overflow-hidden">
					{tracks.length > 0 && (
						<div
							ref={trackListRef}
							className="relative flex flex-col select-none"
							style={{ gap: `${TIMELINE_TRACK_GAP_PX}px` }}
						>
							{reorder.drag && (
								<div
									className="bg-primary pointer-events-none absolute inset-x-0 z-10 h-0.5"
									style={{
										// 맨 위 자리는 목록 밖으로 잘리지 않게 0에 붙인다
										top: `${Math.max(0, reorder.drag.indicatorTop - TIMELINE_TRACK_GAP_PX / 2 - 1)}px`,
									}}
								/>
							)}
							{tracks.map((track, index) => {
								const expandedRows = trackExpandedRowsMap[index];
								const displayName = translateLabel({
									messages: m,
									label: track.name,
								});
								const isRenaming = renamingTrackId === track.id;
								const baseHeight = getTrackHeight(track);
								const folderHeader = folderRows[index]?.header;

								return (
									<Fragment key={track.id}>
										{folderHeader && (
											<TrackFolderHeader
												folder={folderHeader}
												members={tracks.filter(
													({ folderId }) => folderId === folderHeader.id,
												)}
											/>
										)}
										{!folderRows[index]?.hidden && (
											<div
												data-track-row-id={track.id}
												className={cn(
													"group relative flex flex-col",
													tracksWithSelection.has(track.id) &&
														SELECTED_TRACK_ROW_CLASS,
													pickedTrackIds.includes(track.id) &&
														PICKED_TRACK_ROW_CLASS,
													reorder.drag?.trackId === track.id && "opacity-50",
												)}
												style={{
													height: `${baseHeight + getTrackExpansionHeight(index)}px`,
												}}
											>
												<button
													type="button"
													className="absolute inset-x-0 top-0 appearance-none border-0 bg-transparent p-0"
													style={{ height: `${baseHeight}px` }}
													aria-label={m.timeline.selectTrack({
														name: displayName,
													})}
													title={m.timeline.renameTrackHint}
													aria-pressed={pickedTrackIds.includes(track.id)}
													onPointerDown={(event) =>
														reorder.onPointerDown({ event, trackId: track.id })
													}
													onClick={(event) => {
														if (reorder.shouldSuppressClick()) return;
														// 헤더 클릭은 트랙을 고르는 동작이라 클립 선택을 풀어 Delete가 트랙에 가게 한다
														editor.selection.setSelectedElements({
															elements: [],
														});
														// Shift는 마지막에 고른 트랙부터 여기까지 한꺼번에 고른다
														const anchorId = pickedTrackIds.at(-1);
														const anchorIndex = tracks.findIndex(
															({ id }) => id === anchorId,
														);
														if (
															event.shiftKey &&
															anchorId &&
															anchorIndex >= 0
														) {
															const rangeIds = tracks
																.slice(
																	Math.min(anchorIndex, index),
																	Math.max(anchorIndex, index) + 1,
																)
																.map(({ id }) => id)
																.filter((id) => id !== anchorId);
															editor.selection.setSelectedTrackIds({
																trackIds: [...rangeIds, anchorId],
															});
															return;
														}
														editor.selection.selectTrack({
															trackId: track.id,
															isMultiKey:
																event.metaKey ||
																event.ctrlKey ||
																event.shiftKey,
														});
													}}
													onDoubleClick={() => setRenamingTrackId(track.id)}
													onKeyDown={(event) => {
														if (event.key === "F2")
															setRenamingTrackId(track.id);
													}}
												/>
												{(["top", "bottom"] as const).map((edge) => (
													<div
														key={edge}
														aria-hidden
														title={m.timeline.resizeTrack}
														className={cn(
															"hover:bg-primary/60 absolute inset-x-0 z-10 h-1 cursor-row-resize",
															edge === "top" ? "top-0" : "bottom-0",
														)}
														onPointerDown={(event) =>
															startTrackResize({
																event,
																trackId: track.id,
																edge,
															})
														}
														onClick={(event) => event.stopPropagation()}
													/>
												))}
												<TrackColorStrip track={track} />
												<div
													className="pointer-events-none relative flex shrink-0 items-center justify-end gap-2 pr-3 pl-2.5 [&>*]:pointer-events-auto"
													style={{ height: `${baseHeight}px` }}
												>
													{isRenaming ? (
														<input
															// eslint-disable-next-line jsx-a11y/no-autofocus -- 이름 바꾸기를 고르면 바로 입력한다
															autoFocus
															aria-label={m.timeline.trackName}
															defaultValue={displayName}
															className="bg-background min-w-0 flex-1 rounded-sm px-1 text-xs"
															onFocus={(event) => event.currentTarget.select()}
															onBlur={(event) => {
																setRenamingTrackId(null);
																const name = event.currentTarget.value.trim();
																if (name && name !== displayName) {
																	editor.timeline.renameTrack({
																		trackId: track.id,
																		name,
																	});
																}
															}}
															onKeyDown={(event) => {
																event.stopPropagation();
																if (event.nativeEvent.isComposing) return;
																if (event.key === "Escape") {
																	event.currentTarget.value = displayName;
																}
																if (
																	event.key === "Enter" ||
																	event.key === "Escape"
																) {
																	event.currentTarget.blur();
																}
															}}
														/>
													) : (
														// 고르기·이름 바꾸기는 밑에 깔린 버튼이 받는다
														<span className="pointer-events-none! min-w-0 flex-1 truncate text-xs">
															{displayName}
														</span>
													)}
													{canTrackHaveAudio(track) && (
														<TrackToggleIcon
															isOff={track.muted}
															label={
																track.muted
																	? m.timeline.unmuteTrack
																	: m.timeline.muteTrack
															}
															icons={{
																on: VolumeHighIcon,
																off: VolumeOffIcon,
															}}
															onClick={() =>
																editor.timeline.toggleTrackMute({
																	trackId: track.id,
																})
															}
														/>
													)}
													{canTrackBeHidden(track) && (
														<TrackToggleIcon
															isOff={track.hidden}
															label={
																track.hidden
																	? m.timeline.showTrack
																	: m.timeline.hideTrack
															}
															icons={{
																on: ViewIcon,
																off: ViewOffSlashIcon,
															}}
															onClick={() =>
																editor.timeline.toggleTrackVisibility({
																	trackId: track.id,
																})
															}
														/>
													)}
													<TrackToggleIcon
														isOff={track.locked === true}
														label={
															track.locked
																? m.timeline.unlockTrack
																: m.timeline.lockTrack
														}
														icons={{
															on: SquareUnlock02Icon,
															off: LockIcon,
														}}
														onClick={() =>
															editor.timeline.toggleTrackLock({
																trackId: track.id,
															})
														}
													/>
													<TrackIcon track={track} />
												</div>
												{expandedRows.length > 0 && (
													<PropertyTree rows={expandedRows} />
												)}
											</div>
										)}
									</Fragment>
								);
							})}
						</div>
					)}
				</div>
			</div>
			<div
				className="bg-background shrink-0"
				style={{
					height: hasHorizontalScrollbar ? TIMELINE_SCROLLBAR_SIZE_PX : 0,
				}}
			/>
		</div>
	);
}

function TimelineTrackRows({
	zoomLevel,
	dragView,
	onResizeStart,
	onElementMouseDown,
	onElementClick,
	onTrackMouseDown,
	onTrackMouseUp,
	shouldIgnoreClick,
	isDragOver,
	dropTarget,
	folderRows,
}: {
	zoomLevel: number;
	dragView: ElementDragView;
	onResizeStart: React.ComponentProps<
		typeof TimelineTrackContent
	>["onResizeStart"];
	onElementMouseDown: React.ComponentProps<
		typeof TimelineTrackContent
	>["onElementMouseDown"];
	onElementClick: React.ComponentProps<
		typeof TimelineTrackContent
	>["onElementClick"];
	onTrackMouseDown: (event: React.MouseEvent) => void;
	onTrackMouseUp: (event: React.MouseEvent) => void;
	shouldIgnoreClick: () => boolean;
	isDragOver: boolean;
	dropTarget: DropTarget | null;
	folderRows: readonly TrackFolderRow[];
}) {
	const m = useMessages();
	const editor = useEditor();
	const timeline = useEditor((e) => e.timeline);
	const [colorTrackId, setColorTrackId] = useState<string | null>(null);
	const [captionDraft, setCaptionDraft] = useState<{
		trackId: string;
		x: number;
		time: number;
	} | null>(null);
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const tracks = useMemo<TimelineTrack[]>(
		() => (scene ? scene.tracks : []),
		[scene],
	);
	const { selectedElements } = useElementSelection();
	const tracksWithSelection = useMemo(
		() => new Set(selectedElements.map((el) => el.trackId)),
		[selectedElements],
	);
	const pickedTrackIds = useEditor((e) => e.selection.getSelectedTrackIds());

	const expandedElementIds = useTimelineStore((s) => s.expandedElementIds);

	const getTrackExpansionHeight = useCallback(
		(trackIndex: number) => {
			const track = tracks[trackIndex];
			if (!track) return 0;
			return computeTrackExpansionHeight({ track, expandedElementIds });
		},
		[tracks, expandedElementIds],
	);
	const { rows } = useMemo(
		() =>
			getTrackRowLayouts({
				tracks,
				getExtraHeight: getTrackExpansionHeight,
				folderRows,
			}),
		[tracks, getTrackExpansionHeight, folderRows],
	);
	const folders = scene?.trackFolders;
	// 고른 클립이 있는 트랙을 우클릭하면 그 트랙들을, 아니면 우클릭한 트랙만 묶는다
	const getGroupTargetIds = (trackId: string) =>
		tracksWithSelection.has(trackId) ? [...tracksWithSelection] : [trackId];

	const draggingElementIds = useMemo(
		() =>
			dragView.kind === "dragging"
				? dragView.memberTimeOffsets
				: (null as ReadonlyMap<string, MediaTime> | null),
		[dragView],
	);
	const sortedTracks = useMemo(() => {
		if (!draggingElementIds)
			return tracks.map((track, index) => ({ track, index }));
		return [...tracks]
			.map((track, index) => ({ track, index }))
			.sort((a, b) => {
				const aHasDragged = a.track.elements.some((element) =>
					draggingElementIds.has(element.id),
				);
				const bHasDragged = b.track.elements.some((element) =>
					draggingElementIds.has(element.id),
				);
				if (aHasDragged) return 1;
				if (bHasDragged) return -1;
				return 0;
			});
	}, [tracks, draggingElementIds]);

	return (
		<>
			{rows.map(({ folderHeaderTop }, index) => {
				const folder = folderRows[index]?.header;
				if (folderHeaderTop === null || !folder) return null;
				return (
					<div
						key={folder.id}
						className="bg-muted/40 text-muted-foreground pointer-events-none absolute right-0 left-0 flex items-center px-2 text-xs"
						style={{
							top: `${TIMELINE_CONTENT_TOP_PADDING_PX + folderHeaderTop}px`,
							height: `${TIMELINE_FOLDER_HEADER_HEIGHT_PX}px`,
						}}
					>
						{folder.color && (
							<div
								className="absolute inset-0 opacity-20"
								style={{ backgroundColor: folder.color }}
							/>
						)}
						<span className="relative truncate">{folder.name}</span>
					</div>
				);
			})}
			{sortedTracks.map(({ track, index }) =>
				rows[index].hidden ? null : (
					<ContextMenu key={track.id}>
						<ContextMenuTrigger asChild>
							<div
								className={cn(
									"absolute right-0 left-0 transition-colors",
									tracksWithSelection.has(track.id) && SELECTED_TRACK_ROW_CLASS,
									pickedTrackIds.includes(track.id) && PICKED_TRACK_ROW_CLASS,
								)}
								style={{
									top: `${TIMELINE_CONTENT_TOP_PADDING_PX + rows[index].top}px`,
									height: `${rows[index].height}px`,
								}}
							>
								<TimelineTrackContent
									track={track}
									zoomLevel={zoomLevel}
									dragView={dragView}
									onResizeStart={onResizeStart}
									onElementMouseDown={onElementMouseDown}
									onElementClick={onElementClick}
									onTrackMouseDown={onTrackMouseDown}
									onTrackMouseUp={(event) => {
										onTrackMouseUp(event);
										editor.selection.selectTrack({
											trackId: track.id,
											isMultiKey:
												event.metaKey || event.ctrlKey || event.shiftKey,
										});
									}}
									shouldIgnoreClick={shouldIgnoreClick}
									targetElementId={
										isDragOver
											? (dropTarget?.targetElement?.elementId ?? null)
											: null
									}
									onEmptyDoubleClick={({ x, time }) => {
										// 고른 자막 트랙의 빈 곳을 두 번 누르면 그 자리에 자막을 쓴다
										if (
											track.type !== "text" ||
											track.locked ||
											!pickedTrackIds.includes(track.id)
										)
											return;
										setCaptionDraft({ trackId: track.id, x, time });
									}}
								/>
								{captionDraft?.trackId === track.id && (
									<input
										// eslint-disable-next-line jsx-a11y/no-autofocus -- 두 번 누른 자리에서 바로 입력한다
										autoFocus
										aria-label={m.timeline.newCaption}
										placeholder={m.timeline.newCaption}
										className="bg-background border-primary absolute top-1/2 h-7 w-48 -translate-y-1/2 rounded-sm border-2 px-2 text-xs"
										style={{
											left: `${captionDraft.x}px`,
											zIndex: TIMELINE_LAYERS.trackLockOverlay + 1,
										}}
										onMouseDown={(event) => event.stopPropagation()}
										onKeyDown={(event) => {
											if (event.nativeEvent.isComposing) return;
											// Esc는 비우고 나가서 아무것도 넣지 않는다
											if (event.key === "Escape")
												event.currentTarget.value = "";
											if (event.key === "Escape" || event.key === "Enter")
												event.currentTarget.blur();
										}}
										onBlur={(event) => {
											insertCaptionAt({
												editor,
												trackId: captionDraft.trackId,
												startTime: captionDraft.time,
												text: event.currentTarget.value,
											});
											setCaptionDraft(null);
										}}
									/>
								)}
								{track.locked && (
									<div
										className={cn(
											"pointer-events-none absolute inset-0",
											LOCKED_TRACK_OVERLAY_CLASS,
										)}
										style={{ zIndex: TIMELINE_LAYERS.trackLockOverlay }}
									/>
								)}
								<AnchoredColorPopover
									open={colorTrackId === track.id}
									onOpenChange={(open) =>
										setColorTrackId(open ? track.id : null)
									}
									color={getTrackColor({ track })}
									canReset={track.color !== undefined}
									resetLabel={m.timeline.resetColor}
									onColorChange={(color) =>
										timeline.setTrackColor({ trackId: track.id, color })
									}
								/>
							</div>
						</ContextMenuTrigger>
						<ContextMenuContent
							className="w-40"
							// 메뉴가 닫히며 포커스를 되돌리면 막 연 색 팝오버가 바로 닫힌다
							onCloseAutoFocus={(event) => event.preventDefault()}
						>
							<ContextMenuItem
								icon={<HugeiconsIcon icon={TaskAdd02Icon} />}
								onClick={(event: React.MouseEvent) => {
									event.stopPropagation();
									invokeAction("paste-copied");
								}}
							>
								{m.timeline.pasteElements}
							</ContextMenuItem>
							<ContextMenuItem
								icon={<HugeiconsIcon icon={VolumeHighIcon} />}
								onClick={(event: React.MouseEvent) => {
									event.stopPropagation();
									timeline.toggleTrackMute({ trackId: track.id });
								}}
							>
								{canTrackHaveAudio(track) && track.muted
									? m.timeline.unmuteTrack
									: m.timeline.muteTrack}
							</ContextMenuItem>
							<ContextMenuItem
								icon={<HugeiconsIcon icon={ViewIcon} />}
								onClick={(event: React.MouseEvent) => {
									event.stopPropagation();
									timeline.toggleTrackVisibility({ trackId: track.id });
								}}
							>
								{canTrackBeHidden(track) && track.hidden
									? m.timeline.showTrack
									: m.timeline.hideTrack}
							</ContextMenuItem>
							<ContextMenuItem
								icon={<HugeiconsIcon icon={PaintBoardIcon} />}
								onClick={(event: React.MouseEvent) => {
									event.stopPropagation();
									setColorTrackId(track.id);
								}}
							>
								{m.timeline.trackColor}
							</ContextMenuItem>
							<ContextMenuItem
								icon={
									<HugeiconsIcon
										icon={track.locked ? SquareUnlock02Icon : LockIcon}
									/>
								}
								onClick={(event: React.MouseEvent) => {
									event.stopPropagation();
									timeline.toggleTrackLock({ trackId: track.id });
								}}
							>
								{track.locked ? m.timeline.unlockTrack : m.timeline.lockTrack}
							</ContextMenuItem>
							<TrackFolderMenuItem
								track={track}
								folders={folders}
								groupTargetIds={getGroupTargetIds(track.id)}
								tracks={tracks}
							/>
							<ContextMenuItem
								icon={<HugeiconsIcon icon={Delete02Icon} />}
								onClick={(event: React.MouseEvent) => {
									event.stopPropagation();
									timeline.removeTrack({ trackId: track.id });
								}}
								variant="destructive"
							>
								{m.timeline.deleteTrack}
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				),
			)}
		</>
	);
}

function TimelineGutter({
	onMouseDown,
	onClick,
}: {
	onMouseDown: (event: React.MouseEvent) => void;
	onClick: (event: React.MouseEvent) => void;
}) {
	return (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- spatial gesture surface (empty space below tracks); clicks here clear selection. Keyboard control is global timeline shortcuts.
		<div className="flex-1" onMouseDown={onMouseDown} onClick={onClick} />
	);
}

/** 트랙 우클릭 메뉴의 폴더 항목. 폴더 안이면 풀기, 밖이면 묶기 */
function TrackFolderMenuItem({
	track,
	tracks,
	folders,
	groupTargetIds,
}: {
	track: TimelineTrack;
	tracks: TimelineTrack[];
	folders: TrackFolder[] | undefined;
	groupTargetIds: string[];
}) {
	const m = useMessages();
	const timeline = useEditor((e) => e.timeline);
	const folder = folders?.find(({ id }) => id === track.folderId);

	if (folder) {
		return (
			<ContextMenuItem
				icon={<HugeiconsIcon icon={FolderRemoveIcon} />}
				onClick={(event: React.MouseEvent) => {
					event.stopPropagation();
					timeline.ungroupTrackFolder({ folderId: folder.id });
				}}
			>
				{m.timeline.ungroupFolder}
			</ContextMenuItem>
		);
	}
	if (!getGroupableTrackIds({ tracks, folders, trackIds: groupTargetIds })) {
		return null;
	}
	return (
		<ContextMenuItem
			icon={<HugeiconsIcon icon={FolderAddIcon} />}
			onClick={(event: React.MouseEvent) => {
				event.stopPropagation();
				timeline.groupTracksIntoFolder({
					trackIds: groupTargetIds,
					name: m.timeline.newFolder,
				});
			}}
		>
			{m.timeline.groupIntoFolder}
		</ContextMenuItem>
	);
}

/** 폴더 머리 줄. 접기·이름·색과 안의 트랙 전체에 걸리는 토글을 둔다 */
function TrackFolderHeader({
	folder,
	members,
}: {
	folder: TrackFolder;
	members: TimelineTrack[];
}) {
	const m = useMessages();
	const timeline = useEditor((e) => e.timeline);
	const [isRenaming, setIsRenaming] = useState(false);
	const [isColorOpen, setIsColorOpen] = useState(false);
	const toggles = getFolderToggleState({ members });
	const folderId = folder.id;
	const toggleFlag = (flag: "muted" | "hidden" | "locked") =>
		timeline.toggleTrackFolderFlag({ folderId, flag });
	const commitName = (name: string) => {
		setIsRenaming(false);
		const trimmed = name.trim();
		if (trimmed && trimmed !== folder.name) {
			timeline.updateTrackFolder({ folderId, patch: { name: trimmed } });
		}
	};
	const colorProps = {
		color: folder.color,
		canReset: folder.color !== undefined,
		resetLabel: m.timeline.resetColor,
		onColorChange: (color: string | undefined) =>
			timeline.updateTrackFolder({ folderId, patch: { color } }),
	};
	const collapseLabel = folder.collapsed
		? m.timeline.expandFolder
		: m.timeline.collapseFolder;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className="bg-muted/40 relative flex shrink-0 items-center gap-1 pr-2 pl-2.5"
					style={{ height: `${TIMELINE_FOLDER_HEADER_HEIGHT_PX}px` }}
				>
					<ColorStrip label={m.timeline.folderColor} {...colorProps} />
					<ActionTooltip label={collapseLabel}>
						<button
							type="button"
							aria-label={collapseLabel}
							className="text-muted-foreground inline-flex shrink-0 cursor-pointer"
							onClick={() => timeline.toggleTrackFolderCollapsed({ folderId })}
						>
							<HugeiconsIcon
								icon={folder.collapsed ? ArrowRight01Icon : ArrowDown01Icon}
								className="size-3.5"
							/>
						</button>
					</ActionTooltip>
					{isRenaming ? (
						<input
							// eslint-disable-next-line jsx-a11y/no-autofocus -- 이름 바꾸기를 고르면 바로 입력한다
							autoFocus
							aria-label={m.timeline.folderName}
							defaultValue={folder.name}
							className="bg-background min-w-0 flex-1 rounded-sm px-1 text-xs"
							onBlur={(event) => commitName(event.currentTarget.value)}
							onKeyDown={(event) => {
								event.stopPropagation();
								if (event.key === "Escape") {
									event.currentTarget.value = folder.name;
								}
								if (event.key === "Enter" || event.key === "Escape") {
									event.currentTarget.blur();
								}
							}}
						/>
					) : (
						<span
							className="min-w-0 flex-1 truncate text-xs"
							title={folder.name}
							onDoubleClick={() => setIsRenaming(true)}
						>
							{folder.name}
						</span>
					)}
					{!isRenaming && toggles.muted !== null && (
						<TrackToggleIcon
							isOff={toggles.muted}
							label={
								toggles.muted ? m.timeline.unmuteTrack : m.timeline.muteTrack
							}
							icons={{ on: VolumeHighIcon, off: VolumeOffIcon }}
							onClick={() => toggleFlag("muted")}
						/>
					)}
					{!isRenaming && toggles.hidden !== null && (
						<TrackToggleIcon
							isOff={toggles.hidden}
							label={
								toggles.hidden ? m.timeline.showTrack : m.timeline.hideTrack
							}
							icons={{ on: ViewIcon, off: ViewOffSlashIcon }}
							onClick={() => toggleFlag("hidden")}
						/>
					)}
					{!isRenaming && toggles.locked !== null && (
						<TrackToggleIcon
							isOff={toggles.locked}
							label={
								toggles.locked ? m.timeline.unlockTrack : m.timeline.lockTrack
							}
							icons={{ on: SquareUnlock02Icon, off: LockIcon }}
							onClick={() => toggleFlag("locked")}
						/>
					)}
					<AnchoredColorPopover
						open={isColorOpen}
						onOpenChange={setIsColorOpen}
						{...colorProps}
					/>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent
				className="w-40"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<ContextMenuItem
					icon={
						<HugeiconsIcon
							icon={folder.collapsed ? ArrowRight01Icon : ArrowDown01Icon}
						/>
					}
					onClick={() => timeline.toggleTrackFolderCollapsed({ folderId })}
				>
					{collapseLabel}
				</ContextMenuItem>
				<ContextMenuItem
					icon={<HugeiconsIcon icon={PencilEdit01Icon} />}
					onClick={() => setIsRenaming(true)}
				>
					{m.timeline.renameFolder}
				</ContextMenuItem>
				<ContextMenuItem
					icon={<HugeiconsIcon icon={PaintBoardIcon} />}
					onClick={() => setIsColorOpen(true)}
				>
					{m.timeline.folderColor}
				</ContextMenuItem>
				<ContextMenuItem
					icon={<HugeiconsIcon icon={FolderRemoveIcon} />}
					onClick={() => timeline.ungroupTrackFolder({ folderId })}
				>
					{m.timeline.ungroupFolder}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function TrackIcon({ track }: { track: TimelineTrack }) {
	const m = useMessages();
	return (
		<ActionTooltip
			label={translateLabel({
				messages: m,
				label: DEFAULT_TRACK_NAMES[track.type],
			})}
		>
			<span className="inline-flex">{TRACK_ICONS[track.type]}</span>
		</ActionTooltip>
	);
}

function TrackToggleIcon({
	isOff,
	label,
	icons,
	onClick,
}: {
	isOff: boolean;
	label: string;
	icons: {
		on: IconSvgElement;
		off: IconSvgElement;
	};
	onClick: () => void;
}) {
	return (
		<ActionTooltip label={label}>
			<span className="inline-flex">
				{isOff ? (
					<HugeiconsIcon
						icon={icons.off}
						className="text-destructive size-4 cursor-pointer"
						onClick={onClick}
					/>
				) : (
					<HugeiconsIcon
						icon={icons.on}
						className="text-muted-foreground size-4 cursor-pointer"
						onClick={onClick}
					/>
				)}
			</span>
		</ActionTooltip>
	);
}

function PropertyTree({ rows }: { rows: ExpandedRow[] }) {
	const m = useMessages();
	return (
		<div className="flex flex-col overflow-hidden">
			{rows.map((row) => (
				<div
					key={row.propertyPath}
					className={cn("flex shrink-0 items-center px-3 bg-muted/50")}
					style={{ height: `${KEYFRAME_LANE_HEIGHT_PX}px` }}
				>
					<span className="text-muted-foreground truncate text-xs leading-none">
						{translateLabel({
							messages: m,
							label: getPropertyLabel(row.propertyPath),
						})}
					</span>
				</div>
			))}
		</div>
	);
}
