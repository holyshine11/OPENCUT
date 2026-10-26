import { generateUUID } from "@/utils/id";
import { buildDefaultParamValues } from "@/params/registry";
import { effectsRegistry } from "./registry";
import type { ParamValues } from "@/params";
import type { Effect, EffectDefinition, EffectPass } from "@/effects/types";
import { VISUAL_ELEMENT_TYPES } from "@/timeline";
import { ADJUST_EFFECT_TYPE } from "./definitions/adjust";

export { effectsRegistry } from "./registry";
export { registerDefaultEffects } from "./definitions";

export function resolveEffectPasses({
	definition,
	effectParams,
	width,
	height,
}: {
	definition: EffectDefinition;
	effectParams: ParamValues;
	width: number;
	height: number;
}): EffectPass[] {
	if (definition.renderer.buildPasses) {
		return definition.renderer.buildPasses({ effectParams, width, height });
	}
	return definition.renderer.passes.map((pass) => ({
		shader: pass.shader,
		uniforms: pass.uniforms({ effectParams, width, height }),
	}));
}

export const EFFECT_TARGET_ELEMENT_TYPES = VISUAL_ELEMENT_TYPES;

export function buildDefaultEffectInstance({
	effectType,
	params: overrides,
}: {
	effectType: string;
	params?: ParamValues;
}): Effect {
	const definition = effectsRegistry.get(effectType);
	const params: ParamValues = {
		...buildDefaultParamValues(definition.params),
		...overrides,
	};

	return {
		id: generateUUID(),
		type: effectType,
		params,
		enabled: true,
	};
}

/**
 * A clip holds at most one effect per slot: the adjustment, and one look effect.
 * Applying another effect of the same slot edits that one instead of stacking.
 */
export type EffectSlot = "adjust" | "effect";

export function getEffectSlot({ effectType }: { effectType: string }): EffectSlot {
	return effectType === ADJUST_EFFECT_TYPE ? "adjust" : "effect";
}

/** Puts the effect in its slot: replaces the one already there (keeping its id), or appends. */
export function placeEffectInSlot({
	effects,
	effectType,
	params,
}: {
	effects: Effect[];
	effectType: string;
	params?: ParamValues;
}): { effects: Effect[]; effect: Effect } {
	const instance = buildDefaultEffectInstance({ effectType, params });
	const slot = getEffectSlot({ effectType });
	const existing = effects.find(
		(effect) => getEffectSlot({ effectType: effect.type }) === slot,
	);
	if (!existing) {
		return { effects: [...effects, instance], effect: instance };
	}

	const replaced: Effect = { ...instance, id: existing.id };
	return {
		effects: effects.map((effect) =>
			effect.id === existing.id ? replaced : effect,
		),
		effect: replaced,
	};
}
