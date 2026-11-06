import { BaseNode } from "./base-node";
import type { TextElement } from "@/timeline";
import type { EffectPass } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import { drawMeasuredTextLayout } from "@/text/primitives";
import type { MeasuredTextElement } from "@/text/measure-element";
import type { ResolvedTextUnit } from "@/text/text-units";
import { DEFAULTS } from "@/timeline/defaults";
import { resolveTextShadow } from "@/text/shadow";

export type TextNodeParams = TextElement & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	/** 0~100, 글자 채움에만 적용된다 */
	textOpacity: number;
	backgroundColor: string;
	effectPasses: EffectPass[][];
	measuredText: MeasuredTextElement;
	/** 유닛 애니메이션이 걸린 클립의 조각별 모습. 없으면 줄 단위로 그린다 */
	units?: ResolvedTextUnit[];
	/** 글리치 잔상 거리(텍스트 좌표계 px). 0이면 그리지 않는다 */
	split?: number;
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}

	drawMeasuredTextLayout({
		ctx,
		layout: resolved.measuredText,
		textColor: resolved.textColor,
		fillOpacity: resolved.textOpacity / 100,
		background: resolved.measuredText.resolvedBackground,
		backgroundColor: resolved.backgroundColor,
		stroke: resolveTextStroke({ params: node.params.params }),
		shadow: resolveTextShadow({ params: node.params.params }),
		textBaseline: baseline,
		units: resolved.units,
		split: resolved.split,
	});

	ctx.restore();
}

function resolveTextStroke({
	params,
}: {
	params: TextElement["params"];
}): { color: string; width: number } | null {
	if (params["stroke.enabled"] !== true) return null;
	return {
		color:
			typeof params["stroke.color"] === "string"
				? params["stroke.color"]
				: DEFAULTS.text.stroke.color,
		width:
			typeof params["stroke.width"] === "number"
				? params["stroke.width"]
				: DEFAULTS.text.stroke.width,
	};
}
