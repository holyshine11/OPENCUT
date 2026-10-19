import { getPersistedKeybindingsState } from "../persisted-state";

export function v7ToV8({ state }: { state: unknown }): unknown {
	const v7 = getPersistedKeybindingsState({ state });
	if (!v7) return state;
	const keybindings = { ...v7.keybindings };

	keybindings["ctrl+alt+c"] ??= "copy-style";
	keybindings["ctrl+alt+v"] ??= "paste-style";

	return { ...v7, keybindings };
}
