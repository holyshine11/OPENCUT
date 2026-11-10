import type { MaskFill } from "@/masks/types";
import type { ParamDefinition, ParamValues } from "@/params";

export const DEFAULT_GRAPHIC_SOURCE_SIZE = 512;

export interface GraphicRenderContext {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	params: ParamValues;
	width: number;
	height: number;
}

export interface GraphicDefinition {
	id: string;
	name: string;
	keywords: string[];
	params: ParamDefinition[];
	/**
	 * 있으면 도형을 그리지 않고, 도형이 덮은 자리의 아래 화면에 이 효과를 건다.
	 * 강도는 `strength` 파라미터에서 읽는다
	 */
	backdropFill?: Exclude<MaskFill, "clip">;
	render(context: GraphicRenderContext): void;
}

export interface GraphicInstance {
	definitionId: string;
	params: ParamValues;
}
