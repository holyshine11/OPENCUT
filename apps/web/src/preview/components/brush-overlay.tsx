import { useRef, useState } from "react";
import { usePreviewViewport } from "@/preview/components/preview-viewport";
import { useEditor } from "@/editor/use-editor";
import { useMessages } from "@/i18n";
import { getGraphicDefinition } from "@/graphics";
import {
	BRUSH_DEFINITION_ID,
	BRUSH_MAX_WIDTH,
	brushPathToCanvasStrokes,
	buildBrushParams,
	parseBrushPath,
	type BrushStroke,
} from "@/graphics/definitions/brush";
import { useBrushToolStore } from "@/graphics/brush-tool-store";
import { buildTransformFromParams } from "@/rendering";
import { buildGraphicElement } from "@/timeline/element-utils";
import type { GraphicElement } from "@/timeline";
import type { EditorCore } from "@/core";
import { addMediaTime } from "@/wasm";

// 이 거리(화면 px)보다 가까운 점은 버려 경로 문자열이 불필요하게 커지지 않게 한다
const MIN_POINT_DISTANCE_PX = 2;

/** 지금 이어 그릴 브러쉬 클립: 하나만 선택돼 있고 재생 헤드가 그 클립 위에 있을 때 */
function getActiveBrushElement(
	editor: EditorCore,
): { trackId: string; element: GraphicElement } | null {
	const selected = editor.selection.getSelectedElements();
	if (selected.length !== 1) return null;
	const { trackId, elementId } = selected[0];
	const element = editor.timeline
		.getTrackById({ trackId })
		?.elements.find((candidate) => candidate.id === elementId);
	if (element?.type !== "graphic" || element.definitionId !== BRUSH_DEFINITION_ID) {
		return null;
	}
	const time = editor.playback.getCurrentTime();
	const end = addMediaTime({ a: element.startTime, b: element.duration });
	return time >= element.startTime && time < end ? { trackId, element } : null;
}

/** 선택된 브러쉬 클립이 지금 화면에 그려지는 두께 (캔버스 px) */
function getRenderedWidth({
	element,
	minSide,
}: {
	element: GraphicElement;
	minSide: number;
}): number {
	const width = Number(element.params.strokeWidth);
	const path = parseBrushPath(element.params.path);
	if (!path) return width;
	const { scaleX } = buildTransformFromParams({ params: element.params });
	return (width * minSide * Math.abs(scaleX)) / path.extent;
}

export function BrushOverlay() {
	const m = useMessages();
	const editor = useEditor();
	const viewport = usePreviewViewport();
	// 요소 참조를 그대로 돌려줘야 스냅샷 비교가 안정적이다
	const activeBrush = useEditor((e) => getActiveBrushElement(e)?.element ?? null);
	const [points, setPoints] = useState<number[] | null>(null);
	const pointsRef = useRef<number[] | null>(null);
	const { tool, eraserSize } = useBrushToolStore();
	const isErase = tool === "erase";

	const defaults = getGraphicDefinition({ definitionId: BRUSH_DEFINITION_ID }).params;
	const { width: canvasWidth, height: canvasHeight } =
		editor.project.getActive().settings.canvasSize;
	const minSide = Math.min(canvasWidth, canvasHeight);
	const color = String(
		activeBrush?.params.stroke ??
			defaults.find((p) => p.key === "stroke")?.default,
	);
	const width = activeBrush
		? getRenderedWidth({ element: activeBrush, minSide })
		: Number(defaults.find((p) => p.key === "strokeWidth")?.default);

	const update = (next: number[] | null) => {
		pointsRef.current = next;
		setPoints(next);
	};

	const commit = (points: number[]) => {
		const current = getActiveBrushElement(editor);
		const stroke: BrushStroke = isErase ? { erase: eraserSize, p: points } : points;
		// 지우개는 이어 그릴 브러쉬 클립이 있을 때만 의미가 있다
		if (isErase && !current) return;
		if (current) {
			const path = parseBrushPath(current.element.params.path);
			const previous = path
				? brushPathToCanvasStrokes({
						path,
						transform: buildTransformFromParams({ params: current.element.params }),
						canvasWidth,
						canvasHeight,
					})
				: [];
			editor.timeline.updateElements({
				updates: [
					{
						trackId: current.trackId,
						elementId: current.element.id,
						patch: {
							params: {
								...current.element.params,
								...buildBrushParams({
									strokes: [...previous, stroke],
									canvasWidth,
									canvasHeight,
								}),
								// 소스를 다시 감싸면 배율이 바뀌므로 화면 두께가 그대로이도록 맞춘다
								strokeWidth: Math.min(
									BRUSH_MAX_WIDTH,
									Math.max(1, Math.round(width)),
								),
							},
						},
					},
				],
			});
			return;
		}

		editor.timeline.insertElement({
			placement: { mode: "auto" },
			element: buildGraphicElement({
				definitionId: BRUSH_DEFINITION_ID,
				name: m.stickers.categories.brush,
				startTime: editor.playback.getCurrentTime(),
				params: buildBrushParams({ strokes: [points], canvasWidth, canvasHeight }),
			}),
		});
	};

	const handlePointerDown = (event: React.PointerEvent) => {
		if (viewport.handlePanPointerDown({ event }) || event.button !== 0) return;
		const point = viewport.screenToCanvas({
			clientX: event.clientX,
			clientY: event.clientY,
		});
		if (!point) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		update([point.x, point.y]);
	};

	const handlePointerMove = (event: React.PointerEvent) => {
		if (viewport.handlePanPointerMove({ event })) return;
		const current = pointsRef.current;
		if (!current) return;
		const point = viewport.screenToCanvas({
			clientX: event.clientX,
			clientY: event.clientY,
		});
		if (!point) return;
		if (event.shiftKey) {
			// 많이 움직인 축만 따라가 가로·세로 직선으로 고정한다
			const isHorizontal =
				Math.abs(point.x - current[0]) >= Math.abs(point.y - current[1]);
			update([
				current[0],
				current[1],
				isHorizontal ? point.x : current[0],
				isHorizontal ? current[1] : point.y,
			]);
			return;
		}
		const lastX = current[current.length - 2];
		const lastY = current[current.length - 1];
		const minDistance = viewport.screenPixelsToLogicalThreshold({
			screenPixels: MIN_POINT_DISTANCE_PX,
		}).x;
		if (Math.hypot(point.x - lastX, point.y - lastY) < minDistance) return;
		update([...current, point.x, point.y]);
	};

	const handlePointerUp = (event: React.PointerEvent) => {
		if (viewport.handlePanPointerUp({ event })) return;
		const stroke = pointsRef.current;
		update(null);
		if (stroke) commit(stroke);
	};

	const overlayPoints = points
		? Array.from({ length: points.length / 2 }, (_, i) => {
				const { x, y } = viewport.canvasToOverlay({
					canvasX: points[i * 2],
					canvasY: points[i * 2 + 1],
				});
				return `${x},${y}`;
			}).join(" ")
		: null;

	return (
		<div
			className="absolute inset-0 pointer-events-auto"
			style={{ cursor: "crosshair" }}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		>
			{overlayPoints && (
				<svg className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
					<polyline
						points={overlayPoints}
						fill="none"
						stroke={isErase ? "rgba(128, 128, 128, 0.6)" : color}
						strokeWidth={(isErase ? eraserSize : width) * viewport.getDisplayScale().x}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
		</div>
	);
}
