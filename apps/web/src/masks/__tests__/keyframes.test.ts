import { beforeAll, describe, expect, test } from "bun:test";
import { buildMaskParamPath, resolveMaskAtTime } from "@/animation";
import { upsertPathKeyframe } from "@/animation";
import { masksRegistry, registerDefaultMasks } from "@/masks";
import { coerceParamValue, getParamChannelLayout } from "@/params";
import {
	buildMaskEditUpdates,
	dropMaskAnimations,
	getMaskParamDefinition,
} from "@/masks/keyframes";
import { buildMaskWithFill } from "@/masks/list-ops";
import { mediaTime } from "@/wasm";

beforeAll(() => {
	if (!masksRegistry.has("rectangle")) registerDefaultMasks();
});

const at = (ticks: number) => mediaTime({ ticks });

function centerX(params: object): unknown {
	return new Map(Object.entries(params)).get("centerX");
}

describe("mask keyframes", () => {
	test("without keyframes an edit goes to the base params", () => {
		const mask = buildMaskWithFill({ maskType: "rectangle", fill: "mosaic", name: "A" });
		const result = buildMaskEditUpdates({
			masks: [mask],
			animations: undefined,
			maskId: mask.id,
			patch: { centerX: 0.25 },
			localTime: at(0),
			isPlayheadWithinElementRange: true,
		});
		expect(centerX(result.masks[0].params)).toBe(0.25);
		expect(result.animations).toBeUndefined();
	});

	test("an animated value becomes a keyframe at the playhead and interpolates", () => {
		const mask = buildMaskWithFill({ maskType: "rectangle", fill: "mosaic", name: "A" });
		const path = buildMaskParamPath({ maskId: mask.id, paramKey: "centerX" });
		const param = getMaskParamDefinition({ maskType: "rectangle", key: "centerX" });
		if (!param) throw new Error("centerX param missing");
		const seeded = upsertPathKeyframe({
			animations: undefined,
			propertyPath: path,
			time: at(0),
			value: 0,
			channelLayout: getParamChannelLayout({ param }),
			coerceValue: ({ value }) => coerceParamValue({ param, value }),
		});

		const edited = buildMaskEditUpdates({
			masks: [mask],
			animations: seeded,
			maskId: mask.id,
			patch: { centerX: 0.8, width: 0.5 },
			localTime: at(1000),
			isPlayheadWithinElementRange: true,
		});
		// 키프레임 있는 centerX는 키프레임으로, 없는 width는 기본값으로 간다
		expect(centerX(edited.masks[0].params)).toBe(centerX(mask.params));
		expect(new Map(Object.entries(edited.masks[0].params)).get("width")).toBe(0.5);

		const middle = resolveMaskAtTime({
			mask: edited.masks[0],
			animations: edited.animations,
			localTime: 500,
		});
		expect(centerX(middle.params)).toBeCloseTo(0.4, 5);
		expect(
			resolveMaskAtTime({ mask, animations: undefined, localTime: 0 }),
		).toBe(mask);
	});

	test("deleting a mask drops only its channels", () => {
		const keep = buildMaskParamPath({ maskId: "a", paramKey: "centerX" });
		const drop = buildMaskParamPath({ maskId: "b", paramKey: "centerX" });
		const result = dropMaskAnimations({
			animations: { [keep]: undefined, [drop]: undefined, opacity: undefined },
			maskId: "b",
		});
		expect(Object.keys(result ?? {}).sort()).toEqual([keep, "opacity"].sort());
	});
});
