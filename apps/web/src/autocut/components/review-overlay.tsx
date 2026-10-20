"use client";

import { useEditor } from "@/editor/use-editor";
import { useMessages } from "@/i18n";
import type { TimelineElement } from "@/timeline";
import { cn } from "@/utils/ui";
import { mediaTimeToSeconds } from "@/wasm";
import { sourceCutsToTimeline } from "../apply";
import { useAutocutReviewStore } from "../review-store";

const STRIPES = "repeating-linear-gradient(135deg, currentColor 0 4px, transparent 4px 8px)";

/** 검토 중인 편집점을 클립 위에 빗금으로 그린다. 컷은 빨강, 배속은 주황, 유지는 점선 테두리 */
export function AutocutReviewOverlay({
	element,
	pixelsPerSecond,
}: {
	element: TimelineElement;
	pixelsPerSecond: number;
}) {
	const m = useMessages();
	const fps = useEditor((e) => e.project.getActive().settings.fps);
	const elementId = useAutocutReviewStore((state) => state.elementId);
	const items = useAutocutReviewStore((state) => state.items);
	if (elementId !== element.id || items.length === 0) return null;

	const clipStart = mediaTimeToSeconds({ time: element.startTime });
	return sourceCutsToTimeline({ element, cuts: items, fps }).map((item) => {
		const left = (mediaTimeToSeconds({ time: item.start }) - clipStart) * pixelsPerSecond;
		const width = (mediaTimeToSeconds({ time: item.end }) - mediaTimeToSeconds({ time: item.start })) * pixelsPerSecond;
		return (
			<div
				key={item.id}
				className={cn(
					"pointer-events-none absolute inset-y-0 flex items-start justify-center overflow-hidden",
					item.action === "cut" && "bg-red-500/25 text-red-500/60",
					item.action === "speed" && "bg-amber-400/20 text-amber-400/60",
					item.action === "keep" && "border-muted-foreground/60 border-x border-dashed",
				)}
				style={{ left, width, backgroundImage: item.action === "keep" ? undefined : STRIPES }}
			>
				{item.action !== "keep" && (
					<span className="mt-0.5 rounded-sm bg-black/70 px-1 text-[10px] leading-4 text-white">
						{item.action === "cut" ? m.autocut.cut : m.autocut.rate({ rate: item.rate })}
					</span>
				)}
			</div>
		);
	});
}
