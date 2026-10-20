import { useEffect } from "react";
import { invokeAction } from "@/actions";
import { useEditor } from "@/editor/use-editor";
import { useKeybindingsStore } from "@/actions/keybindings-store";
import { isTypableDOMElement } from "@/utils/browser";
import { useTextStyleMemory } from "@/text/style-memory";
import { cancelSpace, pressSpace, releaseSpace } from "@/timeline/space-pan";

/**
 * a composable that hooks to the caller component's
 * lifecycle and hooks to the keyboard events to fire
 * the appropriate actions based on keybindings
 */
export function useKeybindingsListener() {
	const editor = useEditor();
	const {
		keybindings,
		getKeybindingString,
		overlayDepth,
		isLoadingProject,
		isRecording,
	} = useKeybindingsStore();

	useEffect(() => {
		const eventOptions: AddEventListenerOptions = { capture: true };
		const handleKeyDown = (ev: KeyboardEvent) => {
			const normalizedKey = (ev.key ?? "").toLowerCase();

			if (overlayDepth > 0 || isLoadingProject || isRecording) {
				return;
			}

			const binding = getKeybindingString(ev);
			const activeElement = document.activeElement;
			const isTextInput =
				activeElement instanceof HTMLElement &&
				isTypableDOMElement({ element: activeElement });
			const boundAction = binding ? keybindings.get(binding) : undefined;

			// 입력칸의 Esc는 아래 blurOnEscape가 버블 단계에서 처리한다
			if (normalizedKey === "escape" && isTextInput) return;

			if (!binding) return;
			if (!boundAction) return;

			if (isTextInput) return;
			// 슬라이더에 포커스가 있으면 방향키는 슬라이더 값을 움직인다
			if (
				activeElement?.getAttribute("role") === "slider" &&
				normalizedKey.startsWith("arrow")
			) {
				return;
			}
			if (boundAction === "paste-copied") {
				if (!editor.clipboard.hasEntry()) return;
				ev.preventDefault();
				invokeAction("paste-copied", undefined, "keypress");
				return;
			}
			// 복사한 스타일이 없으면 브라우저 붙여넣기(미디어 붙여넣기)를 막지 않는다
			if (
				boundAction === "paste-style" &&
				!useTextStyleMemory.getState().copied
			) {
				return;
			}

			ev.preventDefault();

			// Space 재생은 뗄 때 판단한다. 누른 채 끌면 타임라인 이동(space-pan)
			if (boundAction === "toggle-play" && normalizedKey === " ") {
				pressSpace();
				return;
			}

			switch (boundAction) {
				case "seek-forward":
					invokeAction("seek-forward", { seconds: 1 }, "keypress");
					break;
				case "seek-backward":
					invokeAction("seek-backward", { seconds: 1 }, "keypress");
					break;
				case "jump-forward":
					invokeAction("jump-forward", { seconds: 5 }, "keypress");
					break;
				case "jump-backward":
					invokeAction("jump-backward", { seconds: 5 }, "keypress");
					break;
				default:
					invokeAction(boundAction, undefined, "keypress");
			}
		};

		// 버블 단계라 입력칸이 Esc를 먼저 받는다. 이름 입력칸은 Esc로 원래 값을 되돌린 뒤 스스로 빠진다
		const blurOnEscape = (ev: KeyboardEvent) => {
			const activeElement = document.activeElement;
			if (
				ev.key === "Escape" &&
				activeElement instanceof HTMLElement &&
				isTypableDOMElement({ element: activeElement })
			) {
				activeElement.blur();
			}
		};

		const handleKeyUp = (ev: KeyboardEvent) => {
			if (ev.key === " " && releaseSpace()) {
				invokeAction("toggle-play", undefined, "keypress");
			}
		};

		document.addEventListener("keydown", handleKeyDown, eventOptions);
		document.addEventListener("keydown", blurOnEscape);
		document.addEventListener("keyup", handleKeyUp, eventOptions);
		window.addEventListener("blur", cancelSpace);

		return () => {
			document.removeEventListener("keydown", handleKeyDown, eventOptions);
			document.removeEventListener("keydown", blurOnEscape);
			document.removeEventListener("keyup", handleKeyUp, eventOptions);
			window.removeEventListener("blur", cancelSpace);
		};
	}, [
		keybindings,
		getKeybindingString,
		overlayDepth,
		isLoadingProject,
		isRecording,
		editor,
	]);
}
