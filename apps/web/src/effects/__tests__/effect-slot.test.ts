import { describe, expect, test } from "bun:test";
import { placeEffectInSlot, registerDefaultEffects } from "@/effects";
import { ADJUST_EFFECT_TYPE } from "@/effects/definitions/adjust";
import type { Effect } from "@/effects/types";

registerDefaultEffects();

describe("placeEffectInSlot", () => {
	test("appends when the clip has nothing in that slot", () => {
		const { effects, effect } = placeEffectInSlot({
			effects: [],
			effectType: "glitch",
		});
		expect(effects).toEqual([effect]);
	});

	test("a second look effect replaces the first instead of stacking", () => {
		const first = placeEffectInSlot({ effects: [], effectType: "glitch" });
		const second = placeEffectInSlot({
			effects: first.effects,
			effectType: "pixelate",
		});
		expect(second.effects).toHaveLength(1);
		expect(second.effect.id).toBe(first.effect.id);
		expect(second.effect.type).toBe("pixelate");
	});

	test("adjustment and look effect each keep their own slot", () => {
		const look = placeEffectInSlot({ effects: [], effectType: "glitch" });
		const adjusted = placeEffectInSlot({
			effects: look.effects,
			effectType: ADJUST_EFFECT_TYPE,
			params: { contrast: 20 },
		});
		const regraded = placeEffectInSlot({
			effects: adjusted.effects,
			effectType: ADJUST_EFFECT_TYPE,
			params: { contrast: 40 },
		});
		expect(regraded.effects.map((effect: Effect) => effect.type)).toEqual([
			"glitch",
			ADJUST_EFFECT_TYPE,
		]);
		expect(regraded.effect.params.contrast).toBe(40);
		expect(regraded.effect.enabled).toBe(true);
	});
});
