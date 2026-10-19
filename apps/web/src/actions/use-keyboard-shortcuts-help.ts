"use client";

import { useMemo } from "react";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import {
	ACTIONS,
	getActionDefinition,
	type TActionWithOptionalArgs,
} from "@/actions";
import {
	getPlatformAlternateKey,
	getPlatformShiftKey,
	getPlatformSpecialKey,
	isAppleDevice,
} from "@/utils/platform";
import { useMessages } from "@/i18n";

export interface KeyboardShortcut {
	id: string;
	keys: string[];
	description: string;
	category: string;
	action: TActionWithOptionalArgs;
	icon?: React.ReactNode;
}

function formatKey({ key }: { key: string }): string {
	// space는 단어 경계로 찾아 backspace 안의 space를 건드리지 않는다
	return key
		.replace("ctrl", getPlatformSpecialKey())
		.replace("alt", getPlatformAlternateKey())
		.replace("shift", getPlatformShiftKey())
		.replace("left", "←")
		.replace("right", "→")
		.replace("up", "↑")
		.replace("down", "↓")
		.replace(/\bspace\b/, "Space")
		.replace("backspace", "Backspace")
		.replace("home", "Home")
		.replace("enter", "Enter")
		.replace("end", "End")
		.replace("delete", "Delete")
		.replace("-", "+");
}

// 툴팁용 한 줄 표기. 현재 키바인딩의 첫 키를 쓰고, 맥은 ⌘⇧Z처럼 붙여 쓴다
export function useShortcutLabel({
	action,
}: {
	action: TActionWithOptionalArgs;
}): string | null {
	// 키가 여럿이면 기본 단축키 순서(예: 분할은 C 먼저)를 따른다
	const key = useKeybindingsStore((state) => {
		const keys = state.getKeybindingsForAction(action);
		const preferred = getActionDefinition({ action }).defaultShortcuts ?? [];
		return preferred.find((shortcut) => keys.includes(shortcut)) ?? keys[0];
	});
	if (!key) return null;
	return formatKey({ key })
		.split("+")
		.map((part) => (part.length === 1 ? part.toUpperCase() : part))
		.join(isAppleDevice() ? "" : "+");
}

export function useKeyboardShortcutsHelp() {
	const { keybindings } = useKeybindingsStore();
	const m = useMessages();

	const shortcuts = useMemo(() => {
		const actionToKeys = new Map<TActionWithOptionalArgs, string[]>();

		for (const [key, action] of keybindings) {
			const existing = actionToKeys.get(action);
			if (existing) {
				existing.push(formatKey({ key }));
			} else {
				actionToKeys.set(action, [formatKey({ key })]);
			}
		}

		const result: KeyboardShortcut[] = [];
		for (const [action, keys] of actionToKeys) {
			const actionDef = ACTIONS[action];
			if (!actionDef) continue;
			result.push({
				id: action,
				keys,
				description: m.actions[action],
				category: m.shortcuts.categories[actionDef.category],
				action,
			});
		}

		return result.sort((a, b) => {
			if (a.category !== b.category) {
				return a.category.localeCompare(b.category);
			}
			return a.description.localeCompare(b.description);
		});
	}, [keybindings, m]);

	return {
		shortcuts,
	};
}
