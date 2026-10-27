import type { ParamDefinition, ParamValues } from "@/params";
import type { GraphicDefinition } from "../types";

export const BRUSH_DEFINITION_ID = "brush";
export const BRUSH_MAX_WIDTH = 100;
// 나중에 두께를 최대로 키워도 선이 소스 경계에 잘리지 않을 만큼의 여백 (캔버스 px)
const BRUSH_PADDING = BRUSH_MAX_WIDTH / 2;

/** 지우개 획: erase는 지우개 두께, p는 지나간 점들. 앞선 획만 지우도록 그린 순서대로 둔다 */
export interface BrushErase {
	erase: number;
	p: number[];
}

/** 그리기 획은 점 배열 [x0, y0, x1, y1, ...] 그대로, 지우개 획은 BrushErase */
export type BrushStroke = number[] | BrushErase;

/** 저장할 땐 점과 지우개 두께를 extent로 나눠 0..1로 정규화한다. extent는 정사각 소스의 한 변 (캔버스 px) */
export interface BrushPath {
	extent: number;
	strokes: BrushStroke[];
}

function strokePoints(stroke: BrushStroke): number[] {
	return Array.isArray(stroke) ? stroke : stroke.p;
}

function mapStroke({
	stroke,
	mapPoints,
	mapWidth,
}: {
	stroke: BrushStroke;
	mapPoints: (points: number[]) => number[];
	mapWidth: (width: number) => number;
}): BrushStroke {
	return Array.isArray(stroke)
		? mapPoints(stroke)
		: { erase: mapWidth(stroke.erase), p: mapPoints(stroke.p) };
}

const BRUSH_PARAMS: ParamDefinition[] = [
	{
		key: "stroke",
		label: "Color",
		type: "color",
		default: "#ffffff",
	},
	{
		key: "strokeWidth",
		label: "Thickness",
		type: "number",
		default: 8,
		min: 1,
		max: BRUSH_MAX_WIDTH,
		step: 1,
		shortLabel: "W",
		slider: true,
	},
	{
		key: "path",
		label: "Path",
		type: "text",
		default: "",
		keyframable: false,
		hidden: true,
	},
];

export function parseBrushPath(value: unknown): BrushPath | null {
	if (typeof value !== "string" || !value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null) return null;
		const { extent, strokes } = parsed as Partial<BrushPath>;
		return typeof extent === "number" && extent > 0 && Array.isArray(strokes)
			? { extent, strokes }
			: null;
	} catch {
		return null;
	}
}

export const brushGraphicDefinition: GraphicDefinition = {
	id: BRUSH_DEFINITION_ID,
	name: "Brush",
	keywords: ["brush", "draw", "pen"],
	params: BRUSH_PARAMS,
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);
		const path = parseBrushPath(params.path);
		if (!path) return;

		const drawWidth = (Number(params.strokeWidth ?? 8) * width) / path.extent;
		ctx.strokeStyle = String(params.stroke ?? "#ffffff");
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		for (const item of path.strokes) {
			const stroke = strokePoints(item);
			if (stroke.length < 2) continue;
			const isErase = !Array.isArray(item);
			// 이 소스 캔버스엔 브러쉬만 있으니 destination-out은 앞선 획만 지운다
			ctx.globalCompositeOperation = isErase ? "destination-out" : "source-over";
			ctx.lineWidth = isErase ? item.erase * width : drawWidth;
			ctx.beginPath();
			ctx.moveTo(stroke[0] * width, stroke[1] * height);
			// 점 사이 중점을 지나는 2차 곡선으로 손떨림 각을 부드럽게 한다
			for (let i = 2; i < stroke.length - 2; i += 2) {
				const midX = ((stroke[i] + stroke[i + 2]) / 2) * width;
				const midY = ((stroke[i + 1] + stroke[i + 3]) / 2) * height;
				ctx.quadraticCurveTo(stroke[i] * width, stroke[i + 1] * height, midX, midY);
			}
			ctx.lineTo(stroke[stroke.length - 2] * width, stroke[stroke.length - 1] * height);
			ctx.stroke();
		}
		ctx.globalCompositeOperation = "source-over";
	},
};

interface BrushTransform {
	scaleX: number;
	scaleY: number;
	position: { x: number; y: number };
	rotate: number;
}

/** 저장된 브러쉬 경로를 현재 변형을 적용한 캔버스 좌표 획으로 되돌린다 */
export function brushPathToCanvasStrokes({
	path,
	transform,
	canvasWidth,
	canvasHeight,
}: {
	path: BrushPath;
	transform: BrushTransform;
	canvasWidth: number;
	canvasHeight: number;
}): BrushStroke[] {
	const side = Math.min(canvasWidth, canvasHeight);
	const cx = canvasWidth / 2 + transform.position.x;
	const cy = canvasHeight / 2 + transform.position.y;
	const rad = (transform.rotate * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const toCanvas = (points: number[]) => {
		const out: number[] = [];
		for (let i = 0; i < points.length; i += 2) {
			const lx = (points[i] - 0.5) * side * transform.scaleX;
			const ly = (points[i + 1] - 0.5) * side * transform.scaleY;
			out.push(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos);
		}
		return out;
	};
	const widthScale = side * Math.abs(transform.scaleX);
	return path.strokes.map((stroke) =>
		mapStroke({ stroke, mapPoints: toCanvas, mapWidth: (width) => width * widthScale }),
	);
}

/** 캔버스 좌표 획들을 감싸는 정사각 소스와, 그 소스를 원래 자리에 놓는 변형 파라미터를 만든다 */
export function buildBrushParams({
	strokes,
	canvasWidth,
	canvasHeight,
}: {
	strokes: BrushStroke[];
	canvasWidth: number;
	canvasHeight: number;
}): ParamValues {
	// 지우개 획은 그림을 넓히지 않으니 그리기 획만으로 범위를 잡는다
	const drawn = strokes.filter((stroke) => Array.isArray(stroke));
	const bounded = drawn.length > 0 ? drawn : strokes.map(strokePoints);
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const stroke of bounded) {
		for (let i = 0; i < stroke.length; i += 2) {
			minX = Math.min(minX, stroke[i]);
			maxX = Math.max(maxX, stroke[i]);
			minY = Math.min(minY, stroke[i + 1]);
			maxY = Math.max(maxY, stroke[i + 1]);
		}
	}
	const extent = Math.max(maxX - minX, maxY - minY) + BRUSH_PADDING * 2;
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	const left = cx - extent / 2;
	const top = cy - extent / 2;
	const round = (value: number) => Math.round(value * 10000) / 10000;
	const path: BrushPath = {
		extent,
		strokes: strokes.map((stroke) =>
			mapStroke({
				stroke,
				mapPoints: (points) =>
					points.map((value, i) => round((value - (i % 2 === 0 ? left : top)) / extent)),
				mapWidth: (width) => round(width / extent),
			}),
		),
	};
	const scale = extent / Math.min(canvasWidth, canvasHeight);
	return {
		path: JSON.stringify(path),
		"transform.positionX": cx - canvasWidth / 2,
		"transform.positionY": cy - canvasHeight / 2,
		"transform.scaleX": scale,
		"transform.scaleY": scale,
		"transform.rotate": 0,
	};
}
