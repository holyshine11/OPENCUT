import type { ElementBounds } from "@/preview/element-bounds";

export type CanvasAlign =
	| "left"
	| "centerX"
	| "right"
	| "top"
	| "centerY"
	| "bottom";

export type DistributeAxis = "vertical" | "horizontal";

export interface AlignMargins {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** 정렬 기준 사각형 (캔버스 px) */
export interface AlignFrame {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** 하나만 정렬할 때: 캔버스에서 여백을 뺀 안쪽 */
export function getMarginFrame({
	canvasSize,
	margins,
}: {
	canvasSize: { width: number; height: number };
	margins: AlignMargins;
}): AlignFrame {
	return {
		left: margins.left,
		top: margins.top,
		right: canvasSize.width - margins.right,
		bottom: canvasSize.height - margins.bottom,
	};
}

/** 여러 개를 정렬할 때: PPT처럼 고른 요소 전체를 감싸는 상자 */
export function getSelectionFrame({ bounds }: { bounds: ElementBounds[] }): AlignFrame {
	return {
		left: Math.min(...bounds.map((b) => b.cx - Math.abs(b.width) / 2)),
		top: Math.min(...bounds.map((b) => b.cy - Math.abs(b.height) / 2)),
		right: Math.max(...bounds.map((b) => b.cx + Math.abs(b.width) / 2)),
		bottom: Math.max(...bounds.map((b) => b.cy + Math.abs(b.height) / 2)),
	};
}

/** 요소 상자를 기준 사각형의 가장자리·가운데에 붙이려면 위치를 얼마나 옮겨야 하는지 */
export function getAlignDelta({
	bounds,
	frame,
	align,
}: {
	bounds: ElementBounds;
	frame: AlignFrame;
	align: CanvasAlign;
}): { x: number; y: number } {
	const halfW = Math.abs(bounds.width) / 2;
	const halfH = Math.abs(bounds.height) / 2;
	switch (align) {
		case "left":
			return { x: frame.left + halfW - bounds.cx, y: 0 };
		case "centerX":
			return { x: (frame.left + frame.right) / 2 - bounds.cx, y: 0 };
		case "right":
			return { x: frame.right - halfW - bounds.cx, y: 0 };
		case "top":
			return { x: 0, y: frame.top + halfH - bounds.cy };
		case "centerY":
			return { x: 0, y: (frame.top + frame.bottom) / 2 - bounds.cy };
		case "bottom":
			return { x: 0, y: frame.bottom - halfH - bounds.cy };
	}
}

/**
 * 포토샵 "간격 분포"처럼 화면 위 상자 사이를 gap(px)으로 맞춘다.
 * 위(왼쪽)에 있는 상자부터 늘어놓고 맨 앞 상자는 그대로 둔다. 입력 순서대로 옮길 거리를 돌려준다
 */
export function getDistributeDeltas({
	bounds,
	axis,
	gap,
}: {
	bounds: ElementBounds[];
	axis: DistributeAxis;
	gap: number;
}): { x: number; y: number }[] {
	const center = axis === "vertical" ? "cy" : "cx";
	const size = axis === "vertical" ? "height" : "width";
	const order = bounds
		.map((box, index) => ({ box, index }))
		.sort((a, b) => a.box[center] - a.box[size] / 2 - (b.box[center] - b.box[size] / 2));
	const deltas = bounds.map(() => ({ x: 0, y: 0 }));
	const first = order[0]?.box;
	let cursor = first ? first[center] - first[size] / 2 : 0;
	for (const { box, index } of order) {
		const shift = cursor + box[size] / 2 - box[center];
		deltas[index] = axis === "vertical" ? { x: 0, y: shift } : { x: shift, y: 0 };
		cursor += box[size] + gap;
	}
	return deltas;
}
