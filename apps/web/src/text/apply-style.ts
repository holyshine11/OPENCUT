import type { EditorCore } from "@/core";
import type { ParamValues } from "@/params";
import type { ElementRef } from "@/timeline";
import { pickTextStyle } from "./style-memory";

/** 선택한 요소 중 첫 텍스트의 스타일 */
export function getSelectedTextStyle({
	editor,
	elements,
}: {
	editor: EditorCore;
	elements: ElementRef[];
}): ParamValues | null {
	const text = editor.timeline
		.getElementsWithTracks({ elements })
		.find(({ element }) => element.type === "text");
	return text ? pickTextStyle({ params: text.element.params }) : null;
}

/** 선택한 텍스트 전부에 스타일을 한 번의 실행 취소 단위로 적용한다. 적용한 개수를 돌려준다 */
export function applyTextStyleToElements({
	editor,
	elements,
	style,
}: {
	editor: EditorCore;
	elements: ElementRef[];
	style: ParamValues;
}): number {
	const updates = editor.timeline
		.getElementsWithTracks({ elements })
		.filter(({ element }) => element.type === "text")
		.map(({ track, element }) => ({
			trackId: track.id,
			elementId: element.id,
			patch: { params: style },
		}));
	editor.timeline.updateElements({ updates });
	return updates.length;
}
