"use client";

import { usePreviewViewport } from "@/preview/components/preview-viewport";
import { getVisibleElementsWithBounds } from "@/preview/element-bounds";
import type { MarqueeRect } from "@/preview/controllers/preview-interaction-controller";
import { useEditor } from "@/editor/use-editor";
import { BoundingBoxOutline } from "./handle-primitives";

/** 여러 개를 골랐을 때 각 요소 테두리와, 빈 곳을 끌어 고르는 사각형 */
export function MultiSelectionOverlay({
	marqueeRect,
}: {
	marqueeRect: MarqueeRect | null;
}) {
	const viewport = usePreviewViewport();
	const editor = useEditor();
	const selectedElements = useEditor((e) => e.selection.getSelectedElements());
	// 끄는 동안 테두리가 따라오도록 장면·재생 위치가 바뀌면 다시 그린다
	const tracks = useEditor((e) => e.scenes.getActiveSceneOrNull()?.tracks);
	const currentTime = useEditor((e) => e.playback.getCurrentTime());

	const outlined =
		selectedElements.length > 1 && tracks
			? getVisibleElementsWithBounds({
					tracks,
					currentTime,
					canvasSize: editor.project.getActive().settings.canvasSize,
					mediaAssets: editor.media.getAssets(),
				}).filter(({ trackId, elementId }) =>
					selectedElements.some(
						(selected) =>
							selected.trackId === trackId && selected.elementId === elementId,
					),
				)
			: [];

	if (outlined.length === 0 && !marqueeRect) return null;

	const displayScale = viewport.getDisplayScale();
	const marqueeTopLeft = marqueeRect
		? viewport.canvasToOverlay({
				canvasX: marqueeRect.left,
				canvasY: marqueeRect.top,
			})
		: null;

	return (
		<div
			className="pointer-events-none absolute inset-0 overflow-hidden"
			aria-hidden
		>
			{outlined.map(({ trackId, elementId, bounds }) => (
				<BoundingBoxOutline
					key={`${trackId}:${elementId}`}
					center={viewport.canvasToOverlay({
						canvasX: bounds.cx,
						canvasY: bounds.cy,
					})}
					outlineWidth={Math.abs(bounds.width) * displayScale.x}
					outlineHeight={Math.abs(bounds.height) * displayScale.y}
					rotation={bounds.rotation}
				/>
			))}
			{marqueeRect && marqueeTopLeft && (
				<div
					className="border-primary bg-primary/10 absolute border"
					style={{
						left: marqueeTopLeft.x,
						top: marqueeTopLeft.y,
						width: (marqueeRect.right - marqueeRect.left) * displayScale.x,
						height: (marqueeRect.bottom - marqueeRect.top) * displayScale.y,
					}}
				/>
			)}
		</div>
	);
}
