import {
	getKeyframeAtTime,
	hasKeyframesForPath,
	resolveAnimationPathValueAtTime,
	upsertPathKeyframe,
} from "@/animation";
import { ANIMATION_PROPERTY_GROUPS } from "@/animation/types";
import type { ParamValues } from "@/params";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import type { TimelineElement } from "@/timeline";
import { isVisualElement } from "@/timeline/element-utils";
import {
	type MediaTime,
	maxMediaTime,
	mediaTime,
	minMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

/** CapCut 키프레임 버튼 하나로 함께 찍히는 위치·크기·회전 */
export const TRANSFORM_KEYFRAME_PATHS = [
	"transform.positionX",
	"transform.positionY",
	"transform.scaleX",
	"transform.scaleY",
	"transform.rotate",
] as const;

export type TransformKeyframePath = (typeof TRANSFORM_KEYFRAME_PATHS)[number];

export type TransformValues = Partial<Record<TransformKeyframePath, number>>;

const SCALE_PATHS: readonly TransformKeyframePath[] =
	ANIMATION_PROPERTY_GROUPS["transform.scale"];

function isAnimated({
	element,
	path,
}: {
	element: TimelineElement;
	path: TransformKeyframePath;
}): boolean {
	// 배율 X·Y는 한 값처럼 움직이므로 한쪽에만 키프레임이 있어도 둘 다 키프레임으로 쓴다
	const paths = SCALE_PATHS.includes(path) ? SCALE_PATHS : [path];
	return paths.some((propertyPath) =>
		hasKeyframesForPath({ animations: element.animations, propertyPath }),
	);
}

/**
 * 미리보기에서 바꾼 위치·크기·회전을 요소에 쓴다.
 * 키프레임이 있는 속성은 재생 헤드 위치의 키프레임을 넣거나 고치고(CapCut과 같다),
 * 키프레임이 없는 속성은 기본값을 바꾼다. 재생 헤드가 클립 밖이면(localTime null) 기본값만 바꾼다.
 */
export function buildTransformEditUpdates({
	element,
	localTime,
	values,
}: {
	element: TimelineElement;
	localTime: MediaTime | null;
	values: TransformValues;
}): Pick<TimelineElement, "params" | "animations"> {
	let params: ParamValues = element.params;
	let animations = element.animations;

	for (const path of TRANSFORM_KEYFRAME_PATHS) {
		const value = values[path];
		if (value === undefined) continue;

		const target =
			localTime !== null && isAnimated({ element, path })
				? resolveAnimationTarget({ element, path })
				: null;
		if (!target || localTime === null) {
			params = { ...params, [path]: value };
			continue;
		}

		animations = upsertPathKeyframe({
			animations,
			propertyPath: path,
			time: maxMediaTime({
				a: ZERO_MEDIA_TIME,
				b: minMediaTime({ a: localTime, b: element.duration }),
			}),
			value,
			channelLayout: target.channelLayout,
			coerceValue: target.coerceValue,
		});
	}

	return { params, animations };
}

/** 재생 헤드 위치에 있는 위치·크기·회전 키프레임 */
export function getTransformKeyframesAtTime({
	element,
	localTime,
}: {
	element: TimelineElement;
	localTime: MediaTime;
}): Array<{ propertyPath: TransformKeyframePath; keyframeId: string }> {
	return TRANSFORM_KEYFRAME_PATHS.flatMap((propertyPath) => {
		const keyframe = getKeyframeAtTime({
			animations: element.animations,
			propertyPath,
			time: localTime,
		});
		return keyframe ? [{ propertyPath, keyframeId: keyframe.id }] : [];
	});
}

/** 재생 헤드 위치에서 보이는 그대로의 위치·크기·회전. 키프레임 버튼이 이 값을 찍는다 */
export function getTransformValuesAtTime({
	element,
	localTime,
}: {
	element: TimelineElement;
	localTime: MediaTime;
}): Array<{ propertyPath: TransformKeyframePath; value: number }> {
	return TRANSFORM_KEYFRAME_PATHS.flatMap((propertyPath) => {
		const target = resolveAnimationTarget({ element, path: propertyPath });
		const baseValue = target?.getBaseValue();
		if (typeof baseValue !== "number") return [];

		return [
			{
				propertyPath,
				value: resolveAnimationPathValueAtTime({
					animations: element.animations,
					propertyPath,
					localTime,
					fallbackValue: baseValue,
				}),
			},
		];
	});
}

/**
 * 키프레임 버튼의 상태. 화면에 보이는 클립 하나를 골랐고 재생 헤드가 그 안에 있어야 쓸 수 있다.
 * keyed: 재생 헤드 위치에 위치·크기·회전 키프레임이 하나라도 있다
 */
export function getTransformKeyframeToggleState({
	elements,
	playheadTime,
}: {
	elements: readonly TimelineElement[];
	playheadTime: number;
}):
	| { status: "disabled" }
	| {
			status: "keyed" | "unkeyed";
			element: TimelineElement;
			localTime: MediaTime;
	  } {
	const [element] = elements;
	if (elements.length !== 1 || !element || !isVisualElement(element)) {
		return { status: "disabled" };
	}
	if (
		playheadTime < element.startTime ||
		playheadTime > element.startTime + element.duration
	) {
		return { status: "disabled" };
	}

	const localTime = mediaTime({ ticks: playheadTime - element.startTime });
	return {
		status:
			getTransformKeyframesAtTime({ element, localTime }).length > 0
				? "keyed"
				: "unkeyed",
		element,
		localTime,
	};
}
