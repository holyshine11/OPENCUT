import { splitAnimationsAtTime } from "@/animation";
import { getSourceSpanAtClipTime } from "@/retime";
import { isRetimableElement } from "@/timeline/element-utils";
import type { TimelineElement } from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import {
	addMediaTime,
	type MediaTime,
	roundMediaTime,
	subMediaTime,
} from "@/wasm";

// 자른 자리에는 페이드가 없다. 왼쪽은 페이드 아웃과 크로스페이드(바로 뒤가 오른쪽 조각이 된다), 오른쪽은 페이드 인을 뗀다
function clearFade({
	element,
	keys,
}: {
	element: TimelineElement;
	keys: readonly ("fadeIn" | "fadeOut" | "crossfade")[];
}): Pick<TimelineElement, "params"> {
	const params = { ...element.params };
	for (const key of keys) {
		if (key in params) params[key] = 0;
	}
	return { params };
}

// 경계에 걸린 전환은 경계 왼쪽 클립에 있다. 자르면 원래 끝 경계를 가진 오른쪽 조각이 이어받는다
function withoutTransition(element: TimelineElement): TimelineElement {
	if (!("transition" in element)) return element;
	const { transition: _transition, ...rest } = element;
	return rest;
}

/** 타임라인 시각 splitTime에서 요소 하나를 둘로 나눈다. 오른쪽 조각은 새 id를 받는다. 요소 밖이면 null */
export function splitElementAtTime({
	element,
	splitTime,
}: {
	element: TimelineElement;
	splitTime: MediaTime;
}): { left: TimelineElement; right: TimelineElement } | null {
	const effectiveStart = element.startTime;
	const effectiveEnd = element.startTime + element.duration;
	if (splitTime <= effectiveStart || splitTime >= effectiveEnd) {
		return null;
	}

	const relativeTime = subMediaTime({ a: splitTime, b: element.startTime });
	const leftVisibleDuration = relativeTime;
	const rightVisibleDuration = subMediaTime({ a: element.duration, b: relativeTime });
	const retimeRef = isRetimableElement(element) ? element.retime : undefined;
	// Snap the source-side split point exactly once and derive the right
	// half from it. Independently rounding both spans (left and total)
	// would let a 1-tick rounding error desynchronise them, breaking the
	// invariant `leftSourceSpan + rightSourceSpan == totalSourceSpan`.
	// See the same discipline in `compute-resize.ts` (snap-once comment).
	const leftSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({ clipTime: leftVisibleDuration, retime: retimeRef }),
	});
	const totalSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({ clipTime: element.duration, retime: retimeRef }),
	});
	const rightSourceSpan = subMediaTime({ a: totalSourceSpan, b: leftSourceSpan });
	const { leftAnimations, rightAnimations } = splitAnimationsAtTime({
		animations: element.animations,
		splitTime: relativeTime,
		shouldIncludeSplitBoundary: true,
	});

	return {
		left: {
			...withoutTransition(element),
			duration: leftVisibleDuration,
			trimEnd: addMediaTime({ a: element.trimEnd, b: rightSourceSpan }),
			name: `${element.name} (left)`,
			animations: leftAnimations,
			...clearFade({ element, keys: ["fadeOut", "crossfade"] }),
			...(retimeRef !== undefined ? { retime: retimeRef } : {}),
		},
		right: {
			...element,
			id: generateUUID(),
			startTime: splitTime,
			duration: rightVisibleDuration,
			trimStart: addMediaTime({ a: element.trimStart, b: leftSourceSpan }),
			name: `${element.name} (right)`,
			animations: rightAnimations,
			...clearFade({ element, keys: ["fadeIn"] }),
			...(retimeRef !== undefined ? { retime: retimeRef } : {}),
		},
	};
}
