import { type JSX, useEffect, useState } from "react";
import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import { mediaTimeToSeconds } from "opencut-wasm";
import {
	type MediaTime,
	mediaTimeFromSeconds,
	roundFrameTime,
	TICKS_PER_SECOND,
} from "@/wasm";
import { TIMELINE_RULER_HEIGHT_PX } from "./layout";
import { DEFAULT_FPS } from "@/fps/defaults";
import { useEditor } from "@/editor/use-editor";
import { getRulerConfig, shouldShowLabel } from "@/timeline/ruler-utils";
import { useScrollPosition } from "@/timeline/hooks/use-scroll-position";
import { TimelineTick } from "./timeline-tick";
import { useMessages } from "@/i18n";
import { cn } from "@/utils/ui";

// 이보다 덜 움직이면 끌기가 아니라 Cmd+클릭(시작·끝 지정)으로 본다
const LOOP_DRAG_THRESHOLD_PX = 3;

interface TimelineRulerProps {
	zoomLevel: number;
	dynamicTimelineWidth: number;
	rulerRef: React.Ref<HTMLDivElement>;
	tracksScrollRef: React.RefObject<HTMLElement | null>;
	handleWheel: (e: React.WheelEvent) => void;
	handleTimelineContentClick: (e: React.MouseEvent) => void;
	handleRulerTrackingMouseDown: (e: React.MouseEvent) => void;
	handleRulerMouseDown: (e: React.MouseEvent) => void;
}

export function TimelineRuler({
	zoomLevel,
	dynamicTimelineWidth,
	rulerRef,
	tracksScrollRef,
	handleWheel,
	handleTimelineContentClick,
	handleRulerTrackingMouseDown,
	handleRulerMouseDown,
}: TimelineRulerProps) {
	const m = useMessages();
	const editor = useEditor();
	const loop = useEditor((e) => e.playback.getLoop());
	// Cmd+클릭으로 찍은 구간 시작점. 다음 Cmd+클릭이 끝점이 된다
	const [pendingStart, setPendingStart] = useState<MediaTime | null>(null);

	useEffect(() => {
		if (pendingStart === null) return;
		const cancelOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setPendingStart(null);
		};
		window.addEventListener("keydown", cancelOnEscape);
		return () => window.removeEventListener("keydown", cancelOnEscape);
	}, [pendingStart]);
	const durationTicks = useEditor((e) => e.timeline.getTotalDuration());
	const durationSeconds = mediaTimeToSeconds({ time: durationTicks });
	const pixelsPerSecond = BASE_TIMELINE_PIXELS_PER_SECOND * zoomLevel;
	const visibleDurationSeconds = dynamicTimelineWidth / pixelsPerSecond;
	const effectiveDurationSeconds = Math.max(
		durationSeconds,
		visibleDurationSeconds,
	);
	const fps =
		useEditor((e) => e.project.getActiveOrNull()?.settings.fps) ?? DEFAULT_FPS;
	const { labelIntervalSeconds, tickIntervalSeconds } = getRulerConfig({
		zoomLevel,
		fps,
	});
	const tickCount =
		Math.ceil(effectiveDurationSeconds / tickIntervalSeconds) + 1;

	const { scrollLeft, viewportWidth } = useScrollPosition({
		scrollRef: tracksScrollRef,
	});

	// Keep extra buffer because zoom layout and scroll position can briefly
	// settle on different frames.
	const bufferPx = Math.max(200, (scrollLeft + viewportWidth) * 0.15);

	const visibleStartTimeSeconds = Math.max(
		0,
		(scrollLeft - bufferPx) / pixelsPerSecond,
	);
	const visibleEndTimeSeconds =
		(scrollLeft + viewportWidth + bufferPx) / pixelsPerSecond;

	const startTickIndex = Math.max(
		0,
		Math.floor(visibleStartTimeSeconds / tickIntervalSeconds),
	);
	const endTickIndex = Math.min(
		tickCount - 1,
		Math.ceil(visibleEndTimeSeconds / tickIntervalSeconds),
	);

	const timelineTicks: Array<JSX.Element> = [];
	for (
		let tickIndex = startTickIndex;
		tickIndex <= endTickIndex;
		tickIndex += 1
	) {
		const timeSeconds = tickIndex * tickIntervalSeconds;
		if (timeSeconds > effectiveDurationSeconds) break;

		const timeTicks = Math.round(timeSeconds * TICKS_PER_SECOND);
		const showLabel = shouldShowLabel({
			time: timeSeconds,
			labelIntervalSeconds,
		});
		timelineTicks.push(
			<TimelineTick
				key={tickIndex}
				time={timeTicks}
				timeInSeconds={timeSeconds}
				zoomLevel={zoomLevel}
				fps={fps}
				showLabel={showLabel}
			/>,
		);
	}

	// Cmd(Ctrl)+클릭 두 번으로 시작·끝을 찍거나 Cmd+끌기로 루프 구간을 정한다
	const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.button !== 0 || !(event.metaKey || event.ctrlKey)) {
			handleRulerMouseDown(event);
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const rect = event.currentTarget.getBoundingClientRect();
		const timeAt = (clientX: number) =>
			roundFrameTime({
				time: mediaTimeFromSeconds({
					seconds: Math.max(0, (clientX - rect.left) / pixelsPerSecond),
				}),
				fps,
			});
		const startX = event.clientX;
		const anchor = timeAt(startX);
		let isDragging = false;

		const handleMove = (moveEvent: MouseEvent) => {
			if (Math.abs(moveEvent.clientX - startX) >= LOOP_DRAG_THRESHOLD_PX) {
				isDragging = true;
			}
			if (!isDragging) return;
			setPendingStart(null);
			const time = timeAt(moveEvent.clientX);
			editor.playback.setLoop({
				range:
					time < anchor
						? { start: time, end: anchor }
						: { start: anchor, end: time },
			});
		};
		const handleUp = () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
			if (isDragging) return;
			if (pendingStart === null) {
				setPendingStart(anchor);
				return;
			}
			setPendingStart(null);
			editor.playback.setLoop({
				range:
					anchor < pendingStart
						? { start: anchor, end: pendingStart }
						: { start: pendingStart, end: anchor },
			});
		};
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
	};

	return (
		<div
			role="slider"
			tabIndex={0}
			aria-label={m.timeline.ruler}
			aria-valuemin={0}
			aria-valuemax={effectiveDurationSeconds}
			aria-valuenow={0}
			className="relative flex-1 overflow-x-visible"
			style={{ height: TIMELINE_RULER_HEIGHT_PX }}
			onWheel={handleWheel}
			onClick={(event) => {
				// Ruler seek already happens on mousedown via playhead scrubbing.
				// Forwarding the follow-up click re-enters the selection-clearing path.
				if (event.target === event.currentTarget) {
					handleTimelineContentClick(event);
				}
			}}
			onMouseDown={handleRulerTrackingMouseDown}
			onKeyDown={() => {}}
		>
			<div
				role="none"
				ref={rulerRef}
				className="relative cursor-default select-none"
				style={{
					height: TIMELINE_RULER_HEIGHT_PX,
					width: `${dynamicTimelineWidth}px`,
				}}
				onMouseDown={handleMouseDown}
				title={m.timeline.loopHint}
			>
				{loop && (
					<div
						className={cn(
							"pointer-events-none absolute inset-y-0 border-x-2",
							loop.enabled
								? "border-primary bg-primary/25"
								: "border-muted-foreground/50 bg-muted-foreground/15",
						)}
						style={{
							left: (loop.start / TICKS_PER_SECOND) * pixelsPerSecond,
							width:
								((loop.end - loop.start) / TICKS_PER_SECOND) * pixelsPerSecond,
						}}
					>
						<button
							type="button"
							aria-label={m.timeline.clearLoop}
							title={m.timeline.clearLoop}
							className="bg-background text-muted-foreground hover:text-foreground pointer-events-auto absolute top-1/2 -right-2 z-10 flex size-4 -translate-y-1/2 translate-x-full cursor-pointer items-center justify-center rounded-full border text-[10px] leading-none shadow-sm"
							onMouseDown={(event) => event.stopPropagation()}
							onClick={(event) => {
								event.stopPropagation();
								setPendingStart(null);
								editor.playback.setLoop({ range: null });
							}}
						>
							×
						</button>
					</div>
				)}
				{pendingStart !== null && (
					<div
						className="bg-primary pointer-events-none absolute inset-y-0 w-0.5"
						style={{
							left: (pendingStart / TICKS_PER_SECOND) * pixelsPerSecond,
						}}
					/>
				)}
				{timelineTicks}
			</div>
		</div>
	);
}
