"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
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
import { resolveTimelineElementIntersections } from "./selection-hit-testing";
import { cn } from "@/utils/ui";
import { translateLabel, useMessages } from "@/i18n";
import { ActionTooltip } from "@/actions/components/action-tooltip";
import { DEFAULT_TRACK_NAMES } from "@/timeline/tracks";

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
		() =>
			scene
				? [...scene.tracks.overlay, scene.tracks.main, ...scene.tracks.audio]
				: [],
		[scene],
	);
	const mainTrackId = scene?.tracks.main.id ?? null;
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

			<div className="relative flex flex-1 overflow-hidden" ref={timelineRef}>
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
								}}
							>
								{tracks.length > 0 && (
									<TimelineTrackRows
										mainTrackId={mainTrackId}
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
								onClick={handleTracksClick}
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
		() =>
			scene
				? [...scene.tracks.overlay, scene.tracks.main, ...scene.tracks.audio]
				: [],
		[scene],
	);
	const { selectedElements } = useElementSelection();
	const tracksWithSelection = useMemo(
		() => new Set(selectedElements.map((el) => el.trackId)),
		[selectedElements],
	);

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
							className="flex flex-col"
							style={{ gap: `${TIMELINE_TRACK_GAP_PX}px` }}
						>
							{tracks.map((track, index) => {
								const expandedRows = trackExpandedRowsMap[index];
								const baseHeight = getTrackHeight({ type: track.type });
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
												className={cn(
													"group relative flex flex-col",
													tracksWithSelection.has(track.id) &&
														SELECTED_TRACK_ROW_CLASS,
												)}
												style={{
													height: `${baseHeight + getTrackExpansionHeight(index)}px`,
												}}
											>
												<TrackColorStrip track={track} />
												<div
													className="flex shrink-0 items-center justify-end gap-2 px-3"
													style={{ height: `${baseHeight}px` }}
												>
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
	mainTrackId,
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
	mainTrackId: string | null;
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
	const timeline = useEditor((e) => e.timeline);
	const [colorTrackId, setColorTrackId] = useState<string | null>(null);
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const tracks = useMemo<TimelineTrack[]>(
		() =>
			scene
				? [...scene.tracks.overlay, scene.tracks.main, ...scene.tracks.audio]
				: [],
		[scene],
	);
	const { selectedElements } = useElementSelection();
	const tracksWithSelection = useMemo(
		() => new Set(selectedElements.map((el) => el.trackId)),
		[selectedElements],
	);

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
									onTrackMouseUp={onTrackMouseUp}
									shouldIgnoreClick={shouldIgnoreClick}
									targetElementId={
										isDragOver
											? (dropTarget?.targetElement?.elementId ?? null)
											: null
									}
								/>
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
							{track.id !== mainTrackId && (
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
							)}
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
