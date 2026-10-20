import {
	buildMaskParamPath,
	getKeyframeAtTime,
	hasKeyframesForPath,
	upsertPathKeyframe,
} from "@/animation";
import { KEYFRAMABLE_MASK_PARAM_KEYS } from "@/animation/mask-param-channel";
import type { ElementAnimations } from "@/animation/types";
import { getMaskDefinition } from "@/masks";
import type { Mask } from "@/masks/types";
import { withMaskParams } from "@/masks/with-params";
import {
	coerceParamValue,
	getParamChannelLayout,
	type ParamDefinition,
} from "@/params";
import type { MediaTime } from "@/wasm";

export function getMaskParamDefinition({
	maskType,
	key,
}: {
	maskType: Mask["type"];
	key: string;
}): ParamDefinition | null {
	const param = getMaskDefinition(maskType).params.find(
		(candidate) => candidate.key === key,
	);
	return param ?? null;
}

export function isKeyframableMaskParam(key: string): boolean {
	return KEYFRAMABLE_MASK_PARAM_KEYS.some((candidate) => candidate === key);
}

/**
 * 마스크 값 변경을 요소 업데이트로 바꾼다. 키프레임이 걸린 값은 지금 시점에 키프레임으로,
 * 걸리지 않은 값은 기본값으로 들어간다. 프리뷰 핸들과 마스크 탭이 같이 쓴다
 */
export function buildMaskEditUpdates({
	masks,
	animations,
	maskId,
	patch,
	localTime,
	isPlayheadWithinElementRange,
}: {
	masks: Mask[];
	animations: ElementAnimations | undefined;
	maskId: string;
	patch: Record<string, unknown>;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
}): { masks: Mask[]; animations: ElementAnimations | undefined } {
	const mask = masks.find((candidate) => candidate.id === maskId);
	if (!mask) return { masks, animations };

	let nextAnimations = animations;
	const basePatch: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(patch)) {
		const propertyPath = buildMaskParamPath({ maskId, paramKey: key });
		const param =
			getMaskParamDefinition({ maskType: mask.type, key }) ?? undefined;
		const isAnimated =
			isPlayheadWithinElementRange &&
			isKeyframableMaskParam(key) &&
			param !== undefined &&
			typeof value === "number" &&
			hasKeyframesForPath({ animations: nextAnimations, propertyPath });
		if (isAnimated && param && typeof value === "number") {
			nextAnimations = upsertPathKeyframe({
				animations: nextAnimations,
				propertyPath,
				time: localTime,
				value,
				channelLayout: getParamChannelLayout({ param }),
				coerceValue: ({ value: nextValue }) =>
					coerceParamValue({ param, value: nextValue }),
			});
		} else {
			basePatch[key] = value;
		}
	}

	const nextMasks =
		Object.keys(basePatch).length === 0
			? masks
			: masks.map((candidate) =>
					candidate.id !== maskId
						? candidate
						: withMaskParams({ mask: candidate, patch: basePatch }),
				);

	return { masks: nextMasks, animations: nextAnimations };
}

/** 값들 가운데 하나라도 지금 시점에 키프레임이 있는지 */
export function getMaskKeyframesAtTime({
	animations,
	maskId,
	keys,
	localTime,
}: {
	animations: ElementAnimations | undefined;
	maskId: string;
	keys: readonly string[];
	localTime: MediaTime;
}): Array<{ propertyPath: string; keyframeId: string }> {
	return keys.flatMap((key) => {
		const propertyPath = buildMaskParamPath({ maskId, paramKey: key });
		const keyframe = getKeyframeAtTime({
			animations,
			propertyPath,
			time: localTime,
		});
		return keyframe ? [{ propertyPath, keyframeId: keyframe.id }] : [];
	});
}

/** 지운 마스크의 키프레임을 같이 지운다. 남겨 두면 키프레임 목록에 주인 없는 채널이 생긴다 */
export function dropMaskAnimations({
	animations,
	maskId,
}: {
	animations: ElementAnimations | undefined;
	maskId: string;
}): ElementAnimations | undefined {
	if (!animations) return animations;
	const prefix = buildMaskParamPath({ maskId, paramKey: "" });
	const entries = Object.entries(animations).filter(
		([path]) => !path.startsWith(prefix),
	);
	return entries.length === Object.keys(animations).length
		? animations
		: Object.fromEntries(entries);
}
