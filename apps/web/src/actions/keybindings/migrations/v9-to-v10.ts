import { getPersistedKeybindingsState } from "../persisted-state";

// 컷 편집용 분할 키 C와 클립 묶기 키를 더한다. 사용자가 이미 쓰는 키면 그대로 둔다
export function v9ToV10({ state }: { state: unknown }): unknown {
	const v9 = getPersistedKeybindingsState({ state });
	if (!v9) return state;
	const keybindings = { ...v9.keybindings };

	keybindings.c ??= "split";
	keybindings["ctrl+g"] ??= "group-selected";
	keybindings["ctrl+shift+g"] ??= "ungroup-selected";

	return { ...v9, keybindings };
}
