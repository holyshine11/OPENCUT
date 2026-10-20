import type { ElementAnimations, MaskParamPath } from "@/animation/types";
import type { Mask } from "@/masks/types";
import { withMaskParams } from "@/masks/with-params";
import { resolveAnimationPathValueAtTime } from "./resolve";

export const MASK_PARAM_PATH_PREFIX = "masks.";
export const MASK_PARAM_PATH_SUFFIX = ".params.";

/** 마스크에서 키프레임을 걸 수 있는 숫자 값. 모양을 따라 움직이는 데 필요한 것만 연다 */
export const KEYFRAMABLE_MASK_PARAM_KEYS = [
	"centerX",
	"centerY",
	"width",
	"height",
	"scale",
	"rotation",
	"feather",
	"fillStrength",
] as const;

export function buildMaskParamPath({
	maskId,
	paramKey,
}: {
	maskId: string;
	paramKey: string;
}): MaskParamPath {
	return `${MASK_PARAM_PATH_PREFIX}${maskId}${MASK_PARAM_PATH_SUFFIX}${paramKey}`;
}

export function isMaskParamPath(
	propertyPath: string,
): propertyPath is MaskParamPath {
	return (
		propertyPath.startsWith(MASK_PARAM_PATH_PREFIX) &&
		propertyPath.includes(MASK_PARAM_PATH_SUFFIX)
	);
}

export function parseMaskParamPath({
	propertyPath,
}: {
	propertyPath: string;
}): { maskId: string; paramKey: string } | null {
	if (!isMaskParamPath(propertyPath)) {
		return null;
	}

	const withoutPrefix = propertyPath.slice(MASK_PARAM_PATH_PREFIX.length);
	const separatorIndex = withoutPrefix.indexOf(MASK_PARAM_PATH_SUFFIX);
	if (separatorIndex <= 0) {
		return null;
	}

	const maskId = withoutPrefix.slice(0, separatorIndex);
	const paramKey = withoutPrefix.slice(
		separatorIndex + MASK_PARAM_PATH_SUFFIX.length,
	);
	if (!maskId || !paramKey) {
		return null;
	}

	return { maskId, paramKey };
}

/** 키프레임이 걸린 값만 해당 시점 값으로 바꾼 마스크. 키프레임이 없으면 같은 객체를 돌려준다 */
export function resolveMaskAtTime({
	mask,
	animations,
	localTime,
}: {
	mask: Mask;
	animations: ElementAnimations | undefined;
	localTime: number;
}): Mask {
	if (!animations) return mask;
	const safeLocalTime = Math.max(0, localTime);
	const staticParams = new Map<string, unknown>(Object.entries(mask.params));
	const resolved: Record<string, number> = {};
	let hasAnimated = false;

	for (const paramKey of KEYFRAMABLE_MASK_PARAM_KEYS) {
		const path = buildMaskParamPath({ maskId: mask.id, paramKey });
		if (!animations[path]) continue;
		const staticValue = staticParams.get(paramKey);
		hasAnimated = true;
		resolved[paramKey] = resolveAnimationPathValueAtTime({
			animations,
			propertyPath: path,
			localTime: safeLocalTime,
			fallbackValue: typeof staticValue === "number" ? staticValue : 0,
		});
	}

	return hasAnimated ? withMaskParams({ mask, patch: resolved }) : mask;
}
