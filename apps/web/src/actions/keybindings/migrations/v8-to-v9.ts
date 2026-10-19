import { getPersistedKeybindingsState } from "../persisted-state";

// 기본값 그대로인 키만 바꾼다. 사용자가 바꾼 키는 남긴다
const SWAPPED_DEFAULTS = [
	{ key: "ctrl+c", from: "copy-selected", to: "copy-style" },
	{ key: "ctrl+v", from: "paste-copied", to: "paste-style" },
	{ key: "ctrl+alt+c", from: "copy-style", to: "copy-selected" },
	{ key: "ctrl+alt+v", from: "paste-style", to: "paste-copied" },
] as const;

export function v8ToV9({ state }: { state: unknown }): unknown {
	const v8 = getPersistedKeybindingsState({ state });
	if (!v8) return state;
	const keybindings = { ...v8.keybindings };

	for (const { key, from, to } of SWAPPED_DEFAULTS) {
		if (v8.keybindings[key] === from) keybindings[key] = to;
		keybindings[key] ??= to;
	}

	keybindings.g ??= "timeline-zoom-out";
	keybindings.h ??= "timeline-zoom-in";
	keybindings["shift+enter"] ??= "split-caption-at-playhead";
	keybindings["shift+backspace"] ??= "merge-caption-with-next";

	return { ...v8, keybindings };
}
