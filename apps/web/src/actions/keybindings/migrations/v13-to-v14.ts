import { getPersistedKeybindingsState } from "../persisted-state";

// 클립·트랙 묶기 키는 v9→v10에 뒤늦게 들어가 그 전에 v10을 지난 사용자에게 빠져 있다.
// 다시 더한다. 사용자가 이미 쓰는 키면 그대로 둔다
export function v13ToV14({ state }: { state: unknown }): unknown {
	const v13 = getPersistedKeybindingsState({ state });
	if (!v13) return state;
	const keybindings = { ...v13.keybindings };

	keybindings["ctrl+g"] ??= "group-selected";
	keybindings["ctrl+shift+g"] ??= "ungroup-selected";

	return { ...v13, keybindings };
}
