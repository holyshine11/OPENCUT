import type { Mask } from "@/masks/types";

/** 마스크 종류별 params 타입을 지키면서 값 일부를 바꾼다 */
export function withMaskParams({
	mask,
	patch,
}: {
	mask: Mask;
	patch: Record<string, unknown>;
}): Mask {
	switch (mask.type) {
		case "split":
			return { ...mask, params: { ...mask.params, ...patch } };
		case "cinematic-bars":
			return { ...mask, params: { ...mask.params, ...patch } };
		case "rectangle":
			return { ...mask, params: { ...mask.params, ...patch } };
		case "ellipse":
			return { ...mask, params: { ...mask.params, ...patch } };
		case "heart":
			return { ...mask, params: { ...mask.params, ...patch } };
		case "diamond":
			return { ...mask, params: { ...mask.params, ...patch } };
		case "star":
			return { ...mask, params: { ...mask.params, ...patch } };
		case "text":
			return { ...mask, params: { ...mask.params, ...patch } };
		case "freeform":
			return { ...mask, params: { ...mask.params, ...patch } };
	}
}
