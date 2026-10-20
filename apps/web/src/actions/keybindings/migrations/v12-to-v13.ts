import { getPersistedKeybindingsState } from "../persisted-state";

// 트랙 높이 키 Shift +/-를 더한다. 사용자가 이미 쓰는 키면 그대로 둔다
export function v12ToV13({ state }: { state: unknown }): unknown {
	const v12 = getPersistedKeybindingsState({ state });
	if (!v12) return state;
	const keybindings = { ...v12.keybindings };

	keybindings["shift+="] ??= "track-height-increase";
	keybindings["shift+-"] ??= "track-height-decrease";

	return { ...v12, keybindings };
}
