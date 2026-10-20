import type { Mask, MaskBlendMode, MaskFill } from "@/masks/types";

export const DEFAULT_FILL_STRENGTH = 40;
/** 강도 1이 1920px 너비 화면에서 이만큼의 픽셀이 된다 */
const FILL_STRENGTH_PX_AT_REFERENCE = 0.5;
const FILL_REFERENCE_WIDTH = 1920;

export function getMaskFill(mask: Mask): MaskFill {
	return mask.fill ?? "clip";
}

export function getMaskBlend(mask: Mask): MaskBlendMode {
	return mask.blend ?? "add";
}

export function isEffectFill(fill: MaskFill): boolean {
	return fill !== "clip";
}

/** 모자이크 칸 크기나 블러 시그마를 캔버스 픽셀로 바꾼다 */
export function fillStrengthToPixels({
	strength,
	canvasWidth,
}: {
	strength: number | undefined;
	canvasWidth: number;
}): number {
	return Math.max(
		1,
		(strength ?? DEFAULT_FILL_STRENGTH) *
			FILL_STRENGTH_PX_AT_REFERENCE *
			(canvasWidth / FILL_REFERENCE_WIDTH),
	);
}
