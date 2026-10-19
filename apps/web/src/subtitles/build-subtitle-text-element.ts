import { FONT_SIZE_SCALE_REFERENCE } from "@/text/typography";
import settings from "@/transcription/settings.json";
import { captionFormOf } from "@/transcription/caption-layout-store";
import {
	getTextVisualRect,
	measureTextBlock,
	setCanvasLetterSpacing,
} from "@/text/layout";
import { DEFAULTS } from "@/timeline/defaults";
import { mediaTimeFromSeconds } from "@/wasm";
import type { CreateTextElement } from "@/timeline";
import type { TextBackground } from "@/text/background";
import type {
	TextAlign,
	TextDecoration,
	TextFontStyle,
	TextFontWeight,
} from "@/text/primitives";
import type { SubtitleCue, SubtitleStyleOverrides } from "./types";
import type { ParamValues } from "@/params";
import {
	CAPTION_ELEMENT_NAME_PREFIX,
	getRememberedCaptionStyle,
	pickTextStyle,
} from "@/text/style-memory";

const SUBTITLE_MAX_WIDTH_RATIO = 0.8;
const SUBTITLE_BOTTOM_MARGIN_RATIO = 0.05;
// 자막은 영상 위에서 읽혀야 해서 기본으로 검은 테두리를 켠다
const SUBTITLE_DEFAULT_STROKE = {
	"stroke.enabled": true,
	"stroke.color": DEFAULTS.text.stroke.color,
	"stroke.width": DEFAULTS.text.stroke.width,
};
const MEASUREMENT_CANVAS_SIZE = 4096;

function quoteFontFamily({ fontFamily }: { fontFamily: string }): string {
	return `"${fontFamily.replace(/"/g, '\\"')}"`;
}

function createMeasurementContext(): CanvasRenderingContext2D | null {
	const canvas = document.createElement("canvas");
	canvas.width = MEASUREMENT_CANVAS_SIZE;
	canvas.height = MEASUREMENT_CANVAS_SIZE;
	return canvas.getContext("2d");
}

function measureLineWidth({
	ctx,
	text,
}: {
	ctx: CanvasRenderingContext2D;
	text: string;
}): number {
	return ctx.measureText(text).width;
}

function wrapSubtitleText({
	ctx,
	text,
	maxWidth,
}: {
	ctx: CanvasRenderingContext2D;
	text: string;
	maxWidth: number;
}): string {
	const normalized = text.trim().replace(/\r\n/g, "\n");
	const paragraphs = normalized.split("\n");
	const wrappedParagraphs: string[] = [];

	for (const paragraph of paragraphs) {
		const trimmedParagraph = paragraph.trim();
		if (!trimmedParagraph) {
			wrappedParagraphs.push("");
			continue;
		}

		const words = trimmedParagraph.split(/\s+/);
		let currentLine = words[0] ?? "";
		const lines: string[] = [];

		for (let i = 1; i < words.length; i++) {
			const nextLine = `${currentLine} ${words[i]}`;
			if (measureLineWidth({ ctx, text: nextLine }) <= maxWidth) {
				currentLine = nextLine;
				continue;
			}

			lines.push(currentLine);
			currentLine = words[i];
		}

		lines.push(currentLine);
		wrappedParagraphs.push(lines.join("\n"));
	}

	return wrappedParagraphs.join("\n");
}

function measureWrappedTextBlock({
	ctx,
	content,
	canvasHeight,
	textAlign,
	background,
	fontSize,
	lineHeight,
}: {
	ctx: CanvasRenderingContext2D;
	content: string;
	canvasHeight: number;
	textAlign: TextAlign;
	background: TextBackground;
	fontSize: number;
	lineHeight: number;
}) {
	const scaledFontSize = fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
	const lineHeightPx = lineHeight * scaledFontSize;
	const lines = content.split("\n");
	const lineMetrics = lines.map((line) => ctx.measureText(line));

	const block = measureTextBlock({
		lineMetrics,
		lineHeightPx,
	});
	const visualRect = getTextVisualRect({
		textAlign,
		block,
		background,
		fontSizeRatio: fontSize / 15,
	});

	return {
		block,
		visualRect,
	};
}

function rememberedStyleOverrides({
	remembered,
}: {
	remembered: ParamValues;
}): SubtitleStyleOverrides {
	const {
		fontFamily,
		fontSize,
		fontWeight,
		fontStyle,
		letterSpacing,
		lineHeight,
	} = remembered;
	return {
		fontFamily: typeof fontFamily === "string" ? fontFamily : undefined,
		fontSize: typeof fontSize === "number" ? fontSize : undefined,
		fontWeight:
			fontWeight === "bold" || fontWeight === "normal" ? fontWeight : undefined,
		fontStyle:
			fontStyle === "italic" || fontStyle === "normal" ? fontStyle : undefined,
		letterSpacing:
			typeof letterSpacing === "number" ? letterSpacing : undefined,
		lineHeight: typeof lineHeight === "number" ? lineHeight : undefined,
	};
}

// 형식별 기본 글꼴 크기. 화면 높이 / FONT_SIZE_SCALE_REFERENCE 배로 커져서
// 롱폼 5는 1920×1080에서 60px, 숏폼 3.75는 1080×1920에서 80px가 된다
function defaultSubtitleFontSize({
	canvasSize,
}: {
	canvasSize: { width: number; height: number };
}): number {
	return settings.captionFontSize[captionFormOf({ canvasSize })];
}

function resolveSubtitleStyle({
	style,
	defaultFontSize,
}: {
	style: SubtitleStyleOverrides | undefined;
	defaultFontSize: number;
}): {
	fontFamily: string;
	fontSize: number;
	color: string;
	textAlign: TextAlign;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	textDecoration: TextDecoration;
	letterSpacing: number;
	lineHeight: number;
	background: TextBackground;
	placement: NonNullable<SubtitleStyleOverrides["placement"]>;
} {
	const fontSize =
		style?.fontSizeRatioOfPlayHeight != null
			? style.fontSizeRatioOfPlayHeight * FONT_SIZE_SCALE_REFERENCE
			: (style?.fontSize ?? defaultFontSize);

	return {
		fontFamily: style?.fontFamily ?? "Pretendard",
		fontSize,
		color: style?.color ?? "#ffffff",
		textAlign: style?.textAlign ?? "center",
		fontWeight: style?.fontWeight ?? "bold",
		fontStyle: style?.fontStyle ?? "normal",
		textDecoration: style?.textDecoration ?? "none",
		letterSpacing: style?.letterSpacing ?? DEFAULTS.text.letterSpacing,
		lineHeight: style?.lineHeight ?? DEFAULTS.text.lineHeight,
		background: {
			...DEFAULTS.text.background,
			enabled: false,
			...(style?.background ?? {}),
		},
		placement: {
			verticalAlign: style?.placement?.verticalAlign ?? "bottom",
			marginLeftRatio: style?.placement?.marginLeftRatio,
			marginRightRatio: style?.placement?.marginRightRatio,
			marginVerticalRatio: style?.placement?.marginVerticalRatio,
		},
	};
}

function resolveTargetWidth({
	canvasWidth,
	placement,
}: {
	canvasWidth: number;
	placement: ReturnType<typeof resolveSubtitleStyle>["placement"];
}): number {
	const leftRatio = placement.marginLeftRatio ?? 0;
	const rightRatio = placement.marginRightRatio ?? 0;
	const hasExplicitMargins = leftRatio > 0 || rightRatio > 0;
	if (!hasExplicitMargins) {
		return canvasWidth * SUBTITLE_MAX_WIDTH_RATIO;
	}

	const availableWidth = canvasWidth * (1 - leftRatio - rightRatio);
	return Math.max(0, availableWidth);
}

function resolvePositionX({
	canvasWidth,
	textAlign,
	placement,
	visualRect,
}: {
	canvasWidth: number;
	textAlign: TextAlign;
	placement: ReturnType<typeof resolveSubtitleStyle>["placement"];
	visualRect: { left: number; width: number };
}): number {
	const leftMargin = canvasWidth * (placement.marginLeftRatio ?? 0);
	const rightMargin = canvasWidth * (placement.marginRightRatio ?? 0);
	const canvasCenterX = canvasWidth / 2;

	if (textAlign === "left") {
		return leftMargin - visualRect.left - canvasCenterX;
	}

	if (textAlign === "right") {
		return (
			canvasWidth -
			rightMargin -
			(visualRect.left + visualRect.width) -
			canvasCenterX
		);
	}

	const availableWidth = canvasWidth - leftMargin - rightMargin;
	const targetCenterX = leftMargin + availableWidth / 2;
	return (
		targetCenterX - (visualRect.left + visualRect.width / 2) - canvasCenterX
	);
}

function resolvePositionY({
	canvasHeight,
	placement,
	visualRect,
}: {
	canvasHeight: number;
	placement: ReturnType<typeof resolveSubtitleStyle>["placement"];
	visualRect: { top: number; height: number };
}): number {
	const margin =
		canvasHeight *
		(placement.marginVerticalRatio ?? SUBTITLE_BOTTOM_MARGIN_RATIO);
	const canvasCenterY = canvasHeight / 2;

	if (placement.verticalAlign === "top") {
		return margin - visualRect.top - canvasCenterY;
	}

	if (placement.verticalAlign === "middle") {
		const targetCenterY = canvasHeight / 2;
		return (
			targetCenterY - (visualRect.top + visualRect.height / 2) - canvasCenterY
		);
	}

	return (
		canvasHeight - margin - (visualRect.top + visualRect.height) - canvasCenterY
	);
}

export function buildSubtitleTextElement({
	index,
	caption,
	canvasSize,
}: {
	index: number;
	caption: SubtitleCue;
	canvasSize: { width: number; height: number };
}): CreateTextElement {
	const ctx = createMeasurementContext();
	// ASS 같은 파일에 스타일이 있으면 그걸 따르고, 없으면 마지막에 쓴 자막 스타일을 쓴다
	const remembered = caption.style
		? {}
		: getRememberedCaptionStyle({ canvasSize });
	const style = resolveSubtitleStyle({
		style: caption.style ?? rememberedStyleOverrides({ remembered }),
		defaultFontSize: defaultSubtitleFontSize({ canvasSize }),
	});
	const fontFamily = quoteFontFamily({
		fontFamily: style.fontFamily,
	});
	const fontWeight = style.fontWeight;
	const fontStyle = style.fontStyle === "italic" ? "italic" : "normal";
	const scaledFontSize =
		style.fontSize * (canvasSize.height / FONT_SIZE_SCALE_REFERENCE);
	const fontString = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${fontFamily}, sans-serif`;
	const maxWidth = resolveTargetWidth({
		canvasWidth: canvasSize.width,
		placement: style.placement,
	});

	let content = caption.text;
	let positionX = 0;
	let positionY = 0;

	if (ctx) {
		ctx.font = fontString;
		setCanvasLetterSpacing({ ctx, letterSpacingPx: style.letterSpacing });
		content = wrapSubtitleText({
			ctx,
			text: caption.text,
			maxWidth,
		});
		const measurement = measureWrappedTextBlock({
			ctx,
			content,
			canvasHeight: canvasSize.height,
			textAlign: style.textAlign,
			background: style.background,
			fontSize: style.fontSize,
			lineHeight: style.lineHeight,
		});
		positionX = resolvePositionX({
			canvasWidth: canvasSize.width,
			textAlign: style.textAlign,
			placement: style.placement,
			visualRect: measurement.visualRect,
		});
		positionY = resolvePositionY({
			canvasHeight: canvasSize.height,
			placement: style.placement,
			visualRect: measurement.visualRect,
		});
	}

	return {
		...DEFAULTS.text.element,
		name: `${CAPTION_ELEMENT_NAME_PREFIX}${index + 1}`,
		duration: mediaTimeFromSeconds({ seconds: caption.duration }),
		startTime: mediaTimeFromSeconds({ seconds: caption.startTime }),
		params: {
			...DEFAULTS.text.element.params,
			content,
			fontSize: style.fontSize,
			fontFamily: style.fontFamily,
			color: style.color,
			textAlign: style.textAlign,
			fontWeight: style.fontWeight,
			fontStyle: style.fontStyle,
			textDecoration: style.textDecoration,
			letterSpacing: style.letterSpacing,
			lineHeight: style.lineHeight,
			"background.enabled": style.background.enabled,
			"background.color": style.background.color,
			"background.cornerRadius":
				style.background.cornerRadius ?? DEFAULTS.text.background.cornerRadius,
			"background.paddingX":
				style.background.paddingX ?? DEFAULTS.text.background.paddingX,
			"background.paddingY":
				style.background.paddingY ?? DEFAULTS.text.background.paddingY,
			"background.offsetX":
				style.background.offsetX ?? DEFAULTS.text.background.offsetX,
			"background.offsetY":
				style.background.offsetY ?? DEFAULTS.text.background.offsetY,
			"transform.positionX": positionX,
			"transform.positionY": positionY,
			...SUBTITLE_DEFAULT_STROKE,
			...pickTextStyle({ params: remembered }),
		},
	};
}
