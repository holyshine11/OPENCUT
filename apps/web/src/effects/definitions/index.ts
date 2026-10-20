import { effectsRegistry } from "../registry";
import { adjustEffectDefinition } from "./adjust";
import { blurEffectDefinition } from "./blur";

const defaultEffects = [blurEffectDefinition, adjustEffectDefinition];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}
