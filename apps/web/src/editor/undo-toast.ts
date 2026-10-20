import { toast } from "sonner";
import type { Command } from "@/commands/base-command";
import { EditorCore } from "@/core";
import { getMessages } from "@/i18n";

/**
 * 편집 결과를 알리고 [실행 취소]를 함께 띄운다.
 * 그 사이 다른 편집이 쌓였으면 엉뚱한 작업을 되돌리지 않도록 막는다
 */
export function toastUndoable({
	message,
	command,
}: {
	message: string;
	command: Command;
}): void {
	const m = getMessages();
	toast.success(message, {
		action: {
			label: m.common.undo,
			onClick: () => {
				const editor = EditorCore.getInstance();
				if (editor.command.peekUndo() !== command) {
					toast.info(m.masks.undoStale);
					return;
				}
				editor.command.undo();
			},
		},
	});
}
