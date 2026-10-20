import type { EditorCore } from "@/core";
import { toastUndoable } from "@/editor/undo-toast";
import { getMessages, translateLabel } from "@/i18n";
import { getMaskDefinition } from "@/masks";
import { isMaskableElement } from "@/timeline";

/** Delete 키로 마스크를 지울 때. 마스크 탭의 삭제 메뉴와 같은 토스트를 띄운다 */
export function deleteMaskWithToast({
	editor,
	trackId,
	elementId,
	maskId,
}: {
	editor: EditorCore;
	trackId: string;
	elementId: string;
	maskId: string;
}): void {
	const element = editor.timeline
		.getTrackById({ trackId })
		?.elements.find((candidate) => candidate.id === elementId);
	const mask =
		element && isMaskableElement(element)
			? element.masks?.find((candidate) => candidate.id === maskId)
			: undefined;
	if (!mask) return;

	const m = getMessages();
	const name =
		mask.name ??
		translateLabel({ messages: m, label: getMaskDefinition(mask.type).name });
	const command = editor.timeline.removeMask({ trackId, elementId, maskId });
	toastUndoable({ message: m.masks.removed({ name }), command });
}
