import { describe, expect, test } from "bun:test";
import type { ParamValues } from "@/params";
import {
	ADJUST_SLIDERS,
	adjustEffectDefinition,
	buildAdjustUniform,
	buildDefaultAdjustParams,
} from "@/effects/definitions/adjust";
import {
	ADJUST_PRESETS,
	buildAdjustPresetParams,
	findMatchingAdjustPreset,
} from "@/effects/definitions/adjust-presets";

const passesFor = (effectParams: ParamValues) =>
	adjustEffectDefinition.renderer.buildPasses?.({
		effectParams,
		width: 1920,
		height: 1080,
	});

describe("adjust effect", () => {
	test("fills the 28-slot shader layout in slider order", () => {
		const uniform = buildAdjustUniform({
			temperature: 50,
			exposure: 1,
			shadowHue: 180,
		});
		expect(uniform).toHaveLength(28);
		expect(uniform[0]).toBe(0.5);
		expect(uniform[2]).toBe(0.5);
		expect(
			uniform[ADJUST_SLIDERS.findIndex((s) => s.key === "shadowHue")],
		).toBe(0.5);
	});

	test("missing params fall back to slider defaults, not zero", () => {
		const amountIndex = ADJUST_SLIDERS.findIndex((s) => s.key === "amount");
		expect(buildAdjustUniform({})[amountIndex]).toBe(1);
	});

	test("skips the GPU pass when nothing visible changes", () => {
		expect(passesFor(buildDefaultAdjustParams())).toEqual([]);
		expect(passesFor({ ...buildDefaultAdjustParams(), shadowHue: 90 })).toEqual(
			[],
		);
		expect(passesFor({ contrast: 30, amount: 0 })).toEqual([]);
		expect(passesFor({ contrast: 30 })).toHaveLength(1);
	});

	test("every preset only uses known sliders within range and is recognised back", () => {
		for (const preset of ADJUST_PRESETS) {
			for (const [key, value] of Object.entries(preset.params)) {
				const slider = ADJUST_SLIDERS.find((s) => s.key === key);
				expect(slider).toBeDefined();
				expect(value).toBeGreaterThanOrEqual(slider!.min);
				expect(value).toBeLessThanOrEqual(slider!.max);
			}
			const params = { ...buildAdjustPresetParams(preset), amount: 40 };
			expect(findMatchingAdjustPreset(params)?.id).toBe(preset.id);
		}
	});
});
