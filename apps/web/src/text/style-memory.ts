import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParamValues } from "@/params";
import type { SceneTracks, TextElement } from "@/timeline";

// 글자 내용·시간·투명도를 뺀, 자막과 텍스트의 "모양"을 이루는 파라미터
export const TEXT_STYLE_PARAM_KEYS = [
	"fontFamily",
	"fontSize",
	"color",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"letterSpacing",
	"lineHeight",
	"background.enabled",
	"background.color",
	"background.cornerRadius",
	"background.paddingX",
	"background.paddingY",
	"background.offsetX",
	"background.offsetY",
	"stroke.enabled",
	"stroke.color",
	"stroke.width",
	"shadow.enabled",
	"shadow.color",
	"shadow.opacity",
	"shadow.blur",
	"shadow.offsetX",
	"shadow.offsetY",
	"transform.positionX",
	"transform.positionY",
] as const;

export const CAPTION_ELEMENT_NAME_PREFIX = "Caption ";

// 자막과 일반 텍스트(제목 등)는 위치가 달라서 따로 기억한다
type TextStyleSlot = "text" | "caption";

function getTextStyleSlot({ element }: { element: TextElement }): TextStyleSlot {
	return element.name.startsWith(CAPTION_ELEMENT_NAME_PREFIX)
		? "caption"
		: "text";
}

export function pickTextStyle({ params }: { params: ParamValues }): ParamValues {
	const style: ParamValues = {};
	for (const key of TEXT_STYLE_PARAM_KEYS) {
		if (key in params) style[key] = params[key];
	}
	return style;
}

interface TextStyleMemoryState {
	last: Partial<Record<TextStyleSlot, ParamValues>>;
	copied: ParamValues | null;
	remember: (args: { slot: TextStyleSlot; style: ParamValues }) => void;
	setCopied: (style: ParamValues | null) => void;
}

export const useTextStyleMemory = create<TextStyleMemoryState>()(
	persist(
		(set) => ({
			last: {},
			copied: null,
			remember: ({ slot, style }) =>
				set((state) => ({ last: { ...state.last, [slot]: style } })),
			setCopied: (style) => set({ copied: style }),
		}),
		{
			name: "text-style-memory",
			partialize: (state) => ({ last: state.last }),
		},
	),
);

export function getRememberedTextStyle({
	slot,
}: {
	slot: TextStyleSlot;
}): ParamValues {
	return useTextStyleMemory.getState().last[slot] ?? {};
}

/** 방금 바뀐 텍스트 요소들 중 마지막 것의 스타일을 기억한다 */
export function rememberTextStyles({
	tracks,
	elementIds,
}: {
	tracks: SceneTracks;
	elementIds: ReadonlySet<string>;
}): void {
	let lastChanged: TextElement | null = null;
	for (const track of [...tracks.overlay, tracks.main, ...tracks.audio]) {
		for (const element of track.elements) {
			if (element.type === "text" && elementIds.has(element.id)) {
				lastChanged = element;
			}
		}
	}
	if (!lastChanged) return;

	useTextStyleMemory.getState().remember({
		slot: getTextStyleSlot({ element: lastChanged }),
		style: pickTextStyle({ params: lastChanged.params }),
	});
}
