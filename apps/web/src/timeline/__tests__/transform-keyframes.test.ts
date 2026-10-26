import { describe, expect, test } from "bun:test";
import {
	getKeyframeAtTime,
	hasKeyframesForPath,
	resolveAnimationPathValueAtTime,
	upsertPathKeyframe,
} from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import type { VideoElement } from "@/timeline";
import { resolveAnimationTarget } from "@/timeline/animation-targets";
import {
	buildTransformEditUpdates,
	getTransformKeyframesAtTime,
	getTransformKeyframeToggleState,
	getTransformValuesAtTime,
	TRANSFORM_KEYFRAME_PATHS,
} from "@/timeline/transform-keyframes";
import { mediaTime, ZERO_MEDIA_TIME } from "@/wasm";

function buildVideoElement(
	overrides: Partial<VideoElement> = {},
): VideoElement {
	return {
		id: "video-1",
		type: "video",
		name: "Video 1",
		startTime: mediaTime({ ticks: 100 }),
		duration: mediaTime({ ticks: 1000 }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		mediaId: "media-1",
		params: {
			"transform.positionX": 0,
			"transform.positionY": 0,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
			opacity: 1,
		},
		...overrides,
	};
}

function withKeyframe({
	element,
	path,
	ticks,
	value,
}: {
	element: VideoElement;
	path: (typeof TRANSFORM_KEYFRAME_PATHS)[number];
	ticks: number;
	value: number;
}): ElementAnimations | undefined {
	const target = resolveAnimationTarget({ element, path });
	if (!target) throw new Error(`no target for ${path}`);
	return upsertPathKeyframe({
		animations: element.animations,
		propertyPath: path,
		time: mediaTime({ ticks }),
		value,
		channelLayout: target.channelLayout,
		coerceValue: target.coerceValue,
	});
}

function valueAt({
	element,
	path,
	ticks,
}: {
	element: VideoElement;
	path: (typeof TRANSFORM_KEYFRAME_PATHS)[number];
	ticks: number;
}): number {
	return resolveAnimationPathValueAtTime({
		animations: element.animations,
		propertyPath: path,
		localTime: ticks,
		fallbackValue: Number(element.params[path]),
	});
}

describe("buildTransformEditUpdates", () => {
	test("writes base params when the property has no keyframes", () => {
		const element = buildVideoElement();
		const updates = buildTransformEditUpdates({
			element,
			localTime: mediaTime({ ticks: 500 }),
			values: { "transform.scaleX": 1.3, "transform.scaleY": 1.3 },
		});

		expect(updates.params["transform.scaleX"]).toBe(1.3);
		expect(updates.params["transform.scaleY"]).toBe(1.3);
		expect(updates.animations).toBeUndefined();
	});

	test("adds a keyframe at the playhead when the property is animated (zoom in)", () => {
		const base = buildVideoElement();
		const element = buildVideoElement({
			animations: withKeyframe({
				element: {
					...base,
					animations: withKeyframe({
						element: base,
						path: "transform.scaleX",
						ticks: 0,
						value: 1,
					}),
				},
				path: "transform.scaleY",
				ticks: 0,
				value: 1,
			}),
		});

		const updates = buildTransformEditUpdates({
			element,
			localTime: mediaTime({ ticks: 500 }),
			values: { "transform.scaleX": 1.3, "transform.scaleY": 1.3 },
		});
		const next = { ...element, ...updates };

		expect(next.params["transform.scaleX"]).toBe(1);
		expect(valueAt({ element: next, path: "transform.scaleX", ticks: 0 })).toBe(
			1,
		);
		expect(
			valueAt({ element: next, path: "transform.scaleX", ticks: 500 }),
		).toBe(1.3);
		expect(
			valueAt({ element: next, path: "transform.scaleY", ticks: 500 }),
		).toBe(1.3);
		expect(
			valueAt({ element: next, path: "transform.scaleX", ticks: 250 }),
		).toBeCloseTo(1.15);
	});

	test("keyframes both scale axes when only one axis was animated", () => {
		const base = buildVideoElement();
		const element = buildVideoElement({
			animations: withKeyframe({
				element: base,
				path: "transform.scaleX",
				ticks: 0,
				value: 1,
			}),
		});

		const next = {
			...element,
			...buildTransformEditUpdates({
				element,
				localTime: mediaTime({ ticks: 500 }),
				values: { "transform.scaleX": 1.3, "transform.scaleY": 1.3 },
			}),
		};

		expect(
			hasKeyframesForPath({
				animations: next.animations,
				propertyPath: "transform.scaleY",
			}),
		).toBe(true);
		expect(next.params["transform.scaleY"]).toBe(1);
	});

	test("updates the existing keyframe instead of adding a second one", () => {
		const base = buildVideoElement();
		const element = buildVideoElement({
			animations: withKeyframe({
				element: base,
				path: "transform.positionX",
				ticks: 500,
				value: 10,
			}),
		});

		const next = {
			...element,
			...buildTransformEditUpdates({
				element,
				localTime: mediaTime({ ticks: 500 }),
				values: { "transform.positionX": 40 },
			}),
		};

		expect(
			getTransformKeyframesAtTime({
				element: next,
				localTime: mediaTime({ ticks: 500 }),
			}),
		).toHaveLength(1);
		expect(
			valueAt({ element: next, path: "transform.positionX", ticks: 500 }),
		).toBe(40);
	});

	test("only touches the edited paths", () => {
		const base = buildVideoElement();
		const element = buildVideoElement({
			animations: withKeyframe({
				element: base,
				path: "transform.positionX",
				ticks: 0,
				value: 10,
			}),
		});

		const updates = buildTransformEditUpdates({
			element,
			localTime: mediaTime({ ticks: 500 }),
			values: { "transform.rotate": 15 },
		});

		expect(updates.params["transform.rotate"]).toBe(15);
		expect(updates.params["transform.positionX"]).toBe(0);
		expect(updates.animations).toBe(element.animations);
	});

	test("writes base params when the playhead is outside the clip", () => {
		const base = buildVideoElement();
		const element = buildVideoElement({
			animations: withKeyframe({
				element: base,
				path: "transform.positionX",
				ticks: 0,
				value: 10,
			}),
		});

		const updates = buildTransformEditUpdates({
			element,
			localTime: null,
			values: { "transform.positionX": 99 },
		});

		expect(updates.params["transform.positionX"]).toBe(99);
		expect(updates.animations).toBe(element.animations);
	});
});

describe("keyframe button", () => {
	test("is disabled without exactly one visual clip under the playhead", () => {
		const element = buildVideoElement();
		expect(
			getTransformKeyframeToggleState({ elements: [], playheadTime: 500 })
				.status,
		).toBe("disabled");
		expect(
			getTransformKeyframeToggleState({
				elements: [element, element],
				playheadTime: 500,
			}).status,
		).toBe("disabled");
		expect(
			getTransformKeyframeToggleState({ elements: [element], playheadTime: 50 })
				.status,
		).toBe("disabled");
		expect(
			getTransformKeyframeToggleState({
				elements: [element],
				playheadTime: 1200,
			}).status,
		).toBe("disabled");
	});

	test("reports whether the playhead sits on a transform keyframe", () => {
		const base = buildVideoElement();
		const element = buildVideoElement({
			animations: withKeyframe({
				element: base,
				path: "transform.scaleX",
				ticks: 400,
				value: 1.2,
			}),
		});

		expect(
			getTransformKeyframeToggleState({
				elements: [element],
				playheadTime: 500,
			}).status,
		).toBe("keyed");
		expect(
			getTransformKeyframeToggleState({
				elements: [element],
				playheadTime: 600,
			}).status,
		).toBe("unkeyed");
	});

	test("records every transform property as it looks at the playhead", () => {
		const base = buildVideoElement();
		const element = buildVideoElement({
			params: { ...base.params, "transform.positionX": 25 },
			animations: withKeyframe({
				element: base,
				path: "transform.scaleX",
				ticks: 0,
				value: 2,
			}),
		});

		const values = getTransformValuesAtTime({
			element,
			localTime: mediaTime({ ticks: 300 }),
		});

		expect(values.map(({ propertyPath }) => propertyPath)).toEqual([
			...TRANSFORM_KEYFRAME_PATHS,
		]);
		expect(
			values.find(({ propertyPath }) => propertyPath === "transform.positionX")
				?.value,
		).toBe(25);
		expect(
			values.find(({ propertyPath }) => propertyPath === "transform.scaleX")
				?.value,
		).toBe(2);
	});

	test("finds keyframes only at the exact playhead time", () => {
		const base = buildVideoElement();
		const element = buildVideoElement({
			animations: withKeyframe({
				element: base,
				path: "transform.rotate",
				ticks: 300,
				value: 5,
			}),
		});

		expect(
			getTransformKeyframesAtTime({
				element,
				localTime: mediaTime({ ticks: 300 }),
			}),
		).toEqual([
			{
				propertyPath: "transform.rotate",
				keyframeId:
					getKeyframeAtTime({
						animations: element.animations,
						propertyPath: "transform.rotate",
						time: 300,
					})?.id ?? "",
			},
		]);
		expect(
			getTransformKeyframesAtTime({
				element,
				localTime: mediaTime({ ticks: 301 }),
			}),
		).toEqual([]);
	});
});
