import type { EditorSelectionPatch } from "@/selection/editor-selection";
import type { ElementRef } from "@/timeline/types";

export interface CommandResult {
	selection?: EditorSelectionPatch;
}

export function createElementSelectionResult(
	selectedElements: ElementRef[],
): CommandResult {
	return {
		selection: {
			selectedElements,
			selectedKeyframes: [],
			keyframeSelectionAnchor: null,
			selectedMaskPoints: null,
		},
	};
}

export abstract class Command {
	/** 실행 취소 버튼 툴팁에 보여 줄 영어 라벨. translateLabel로 옮겨 쓴다 */
	label?: string;
	/** 명령이 스스로 뒤 요소를 당긴다. 켜 두면 리플 편집 모드에서도 한 번 더 당기지 않는다 */
	readonly ripplesItself?: boolean;

	abstract execute(): CommandResult | undefined;

	undo(): void {
		throw new Error("Undo not implemented for this command");
	}

	redo(): CommandResult | undefined {
		return this.execute();
	}
}
