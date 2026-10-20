import { getPersistedKeybindingsState } from "../persisted-state";

// 맞붙은 클립 크로스페이드 키 X를 더한다. 사용자가 이미 쓰는 키면 그대로 둔다
export function v10ToV11({ state }: { state: unknown }): unknown {
	const v10 = getPersistedKeybindingsState({ state });
	if (!v10) return state;
	const keybindings = { ...v10.keybindings };

	keybindings.x ??= "toggle-crossfade-selected";

	return { ...v10, keybindings };
}
