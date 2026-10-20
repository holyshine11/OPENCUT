import { getPersistedKeybindingsState } from "../persisted-state";

// 루프 구간 켜기/끄기 키 /를 더한다. 사용자가 이미 쓰는 키면 그대로 둔다
export function v11ToV12({ state }: { state: unknown }): unknown {
	const v11 = getPersistedKeybindingsState({ state });
	if (!v11) return state;
	const keybindings = { ...v11.keybindings };

	keybindings["/"] ??= "toggle-loop";

	return { ...v11, keybindings };
}
