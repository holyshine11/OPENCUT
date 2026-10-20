"use client";

import { useEditor } from "@/editor/use-editor";
import type { TimelineElement } from "@/timeline";
import { cn } from "@/utils/ui";
import { mediaTimeToSeconds } from "@/wasm";
import { sourcePointsToTimeline } from "../apply";
import { useAutocutReviewStore } from "../review-store";

/** 검토 중인 편집점을 클립 위에 세로선으로 그린다. 끈 지점은 점선 */
export function AutocutReviewOverlay({
	element,
	pixelsPerSecond,
}: {
	element: TimelineElement;
	pixelsPerSecond: number;
}) {
	const fps = useEditor((e) => e.project.getActive().settings.fps);
	const elementId = useAutocutReviewStore((state) => state.elementId);
	const items = useAutocutReviewStore((state) => state.items);
	if (elementId !== element.id || items.length === 0) return null;

	const clipStart = mediaTimeToSeconds({ time: element.startTime });
	return sourcePointsToTimeline({ element, points: items, fps }).map((item) => (
		<div
			key={item.id}
			className={cn(
				"pointer-events-none absolute inset-y-0 w-0 border-l",
				item.enabled ? "border-red-500" : "border-muted-foreground/60 border-dashed",
			)}
			style={{ left: (mediaTimeToSeconds({ time: item.time }) - clipStart) * pixelsPerSecond }}
		/>
	));
}
