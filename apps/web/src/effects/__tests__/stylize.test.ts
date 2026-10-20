import { describe, expect, test } from "bun:test";
import {
	buildStylizeUniform,
	stylizeEffectDefinitions,
} from "@/effects/definitions/stylize";

const byType = (type: string) => {
	const definition = stylizeEffectDefinitions.find((d) => d.type === type);
	if (!definition) throw new Error(type);
	return definition;
};

describe("stylize effects", () => {
	test("packs mode, mix and normalized params into 28 slots", () => {
		const wave = byType("wave");
		const mode = stylizeEffectDefinitions.indexOf(wave);
		const values = buildStylizeUniform({
			mode,
			params: wave.params.filter((param) => param.key !== "mix"),
			effectParams: { intensity: 50, frequency: 100, direction: "Vertical", mix: 25 },
		});
		expect(values).toHaveLength(28);
		expect(values.slice(0, 5)).toEqual([mode, 0.25, 0.5, 1, 1]);
	});

	test("degrees become turns and missing values fall back to defaults", () => {
		const duotone = byType("duotone");
		const values = buildStylizeUniform({
			mode: 0,
			params: duotone.params.filter((param) => param.key !== "mix"),
			effectParams: { shadowHue: 180 },
		});
		expect(values[1]).toBe(1);
		expect(values[2]).toBe(0.5);
		expect(values[3]).toBeCloseTo(330 / 360);
	});

	test("mix 0 renders nothing", () => {
		const passes = byType("glitch").renderer.buildPasses?.({
			effectParams: { mix: 0 },
			width: 1,
			height: 1,
		});
		expect(passes).toEqual([]);
	});

	test("every effect fits the shader's param slots", () => {
		for (const definition of stylizeEffectDefinitions) {
			expect(definition.params.length + 1).toBeLessThanOrEqual(28);
		}
	});
});
