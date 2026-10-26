import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParamValues } from "@/params";
import type { SceneTracks, TextElement } from "@/timeline";
import {
	captionFormOf,
	type CaptionForm,
} from "@/transcription/caption-layout-store";

// 글자 내용·시간·투명도를 뺀, 자막과 텍스트의 "모양"을 이루는 파라미터
export const TEXT_STYLE_PARAM_KEYS = [
	"fontFamily",
	"fontSize",
	"color",
	"colorOpacity",
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

// 화면 크기에 따라 값이 달라지는 키. 숏폼에서 정한 크기·위치를 롱폼에 그대로 쓰면 어긋난다
const FORM_DEPENDENT_STYLE_KEYS: ReadonlySet<string> = new Set([
	"fontSize",
	"transform.positionX",
	"transform.positionY",
]);

// 자막과 일반 텍스트(제목 등)는 위치가 달라서 따로 기억한다
type TextStyleSlot = "text" | "caption";

function getTextStyleSlot({
	element,
}: {
	element: TextElement;
}): TextStyleSlot {
	return element.name.startsWith(CAPTION_ELEMENT_NAME_PREFIX)
		? "caption"
		: "text";
}

export function pickTextStyle({
	params,
}: {
	params: ParamValues;
}): ParamValues {
	const style: ParamValues = {};
	for (const key of TEXT_STYLE_PARAM_KEYS) {
		if (key in params) style[key] = params[key];
	}
	return style;
}

interface TextStyleMemoryState {
	last: Partial<Record<TextStyleSlot, ParamValues>>;
	// 마지막 자막 스타일을 정한 화면 형식
	captionForm?: CaptionForm;
	copied: ParamValues | null;
	remember: (args: {
		slot: TextStyleSlot;
		style: ParamValues;
		form: CaptionForm;
	}) => void;
	setCopied: (style: ParamValues | null) => void;
}

export const useTextStyleMemory = create<TextStyleMemoryState>()(
	persist(
		(set) => ({
			last: {},
			copied: null,
			remember: ({ slot, style, form }) =>
				set((state) => ({
					last: { ...state.last, [slot]: style },
					captionForm: slot === "caption" ? form : state.captionForm,
				})),
			setCopied: (style) => set({ copied: style }),
		}),
		{
			name: "text-style-memory",
			partialize: (state) => ({
				last: state.last,
				captionForm: state.captionForm,
			}),
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

/** 자막 스타일. 다른 형식에서 정한 것이면 글꼴 크기와 위치는 빼서 형식 기본값을 쓰게 한다 */
export function getRememberedCaptionStyle({
	canvasSize,
}: {
	canvasSize: { width: number; height: number };
}): ParamValues {
	const { last, captionForm } = useTextStyleMemory.getState();
	const style = last.caption ?? {};
	if (captionForm === captionFormOf({ canvasSize })) return style;
	return Object.fromEntries(
		Object.entries(style).filter(
			([key]) => !FORM_DEPENDENT_STYLE_KEYS.has(key),
		),
	);
}

function textElementsOf({
	tracks,
	elementIds,
}: {
	tracks: SceneTracks;
	elementIds: ReadonlySet<string>;
}): TextElement[] {
	return tracks.flatMap((track) =>
		track.elements.filter(
			(element): element is TextElement =>
				element.type === "text" && elementIds.has(element.id),
		),
	);
}

function hasSameStyle({ a, b }: { a: TextElement; b: TextElement }): boolean {
	return TEXT_STYLE_PARAM_KEYS.every((key) =>
		Object.is(a.params[key], b.params[key]),
	);
}

/**
 * 방금 스타일이 바뀐 텍스트 요소들 중 마지막 것의 스타일을 기억한다.
 * 글자나 시간만 고친 요소는 건너뛴다. 옛 자막의 오타를 고쳤다고 기억이 옛 스타일로 돌아가면 안 된다
 */
export function rememberTextStyles({
	before,
	tracks,
	elementIds,
	canvasSize,
}: {
	before: SceneTracks;
	tracks: SceneTracks;
	elementIds: ReadonlySet<string>;
	canvasSize: { width: number; height: number };
}): void {
	const previous = new Map(
		textElementsOf({ tracks: before, elementIds }).map((element) => [
			element.id,
			element,
		]),
	);
	const lastChanged = textElementsOf({ tracks, elementIds })
		.filter((element) => {
			const old = previous.get(element.id);
			return !old || !hasSameStyle({ a: old, b: element });
		})
		.at(-1);
	if (!lastChanged) return;

	useTextStyleMemory.getState().remember({
		slot: getTextStyleSlot({ element: lastChanged }),
		style: pickTextStyle({ params: lastChanged.params }),
		form: captionFormOf({ canvasSize }),
	});
}
