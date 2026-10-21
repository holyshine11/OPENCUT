import { getPersistedKeybindingsState } from "../persisted-state";

// 키가 없던 재생 중지·리플·원본 오디오·북마크·음소거·숨기기 키를 더한다.
// 사용자가 이미 쓰는 키면 그대로 둔다
export function v14ToV15({ state }: { state: unknown }): unknown {
	const v14 = getPersistedKeybindingsState({ state });
	if (!v14) return state;
	const keybindings = { ...v14.keybindings };

	keybindings["shift+space"] ??= "stop-playback";
	keybindings.r ??= "toggle-ripple-editing";
	keybindings["shift+a"] ??= "toggle-source-audio";
	keybindings.m ??= "toggle-bookmark";
	keybindings["shift+m"] ??= "toggle-elements-muted-selected";
	keybindings.v ??= "toggle-elements-visibility-selected";

	return { ...v14, keybindings };
}
