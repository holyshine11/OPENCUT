import { getPersistedKeybindingsState } from "../persisted-state";

export function v8ToV9({ state }: { state: unknown }): unknown {
	const v8 = getPersistedKeybindingsState({ state });
	if (!v8) return state;
	const keybindings = { ...v8.keybindings };

	keybindings.g ??= "timeline-zoom-out";
	keybindings.h ??= "timeline-zoom-in";

	return { ...v8, keybindings };
}
