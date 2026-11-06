import type { TextCanvasContext, TextBlockMeasurement } from "@/text/layout";
import { DEFAULTS } from "@/timeline/defaults";
import { clamp } from "@/utils/math";
import { CORNER_RADIUS_MAX, CORNER_RADIUS_MIN } from "./background";
import {
	drawTextDecoration,
	getLineX,
	getTextBackgroundRect,
	measureTextBlock,
	setCanvasLetterSpacing,
} from "./layout";
import { FONT_SIZE_SCALE_REFERENCE } from "./typography";
import type { TextShadow } from "./shadow";
import type { ResolvedTextUnit } from "./text-units";

export type TextAlign = "left" | "center" | "right";
export type TextFontWeight = "normal" | "bold";
export type TextFontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline" | "line-through";

export interface TextLayoutParams {
	content: string;
	fontSize: number;
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	textAlign: TextAlign;
	textDecoration?: TextDecoration;
	letterSpacing?: number;
	lineHeight?: number;
}

export interface ResolvedTextLayout {
	scaledFontSize: number;
	fontString: string;
	letterSpacing: number;
	lineHeightPx: number;
	fontSizeRatio: number;
	textAlign: TextAlign;
	textDecoration: TextDecoration;
}

export interface MeasuredTextLayout extends ResolvedTextLayout {
	lines: string[];
	lineMetrics: TextMetrics[];
	block: TextBlockMeasurement;
}

export interface ResolvedTextBackgroundLike {
	enabled: boolean;
	color: string;
	paddingX: number;
	paddingY: number;
	offsetX: number;
	offsetY: number;
	cornerRadius: number;
}

export function quoteFontFamily({ fontFamily }: { fontFamily: string }): string {
	return `"${fontFamily.replace(/"/g, '\\"')}"`;
}

export function buildTextFontString({
	fontFamily,
	fontWeight,
	fontStyle,
	scaledFontSize,
}: {
	fontFamily: string;
	fontWeight: TextFontWeight;
	fontStyle: TextFontStyle;
	scaledFontSize: number;
}): string {
	return `${fontStyle} ${fontWeight} ${scaledFontSize}px ${quoteFontFamily({ fontFamily })}, sans-serif`;
}

export function resolveTextLayout({
	text,
	canvasHeight,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
}): ResolvedTextLayout {
	const scaledFontSize =
		text.fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
	const fontWeight = text.fontWeight === "bold" ? "bold" : "normal";
	const fontStyle = text.fontStyle === "italic" ? "italic" : "normal";
	const letterSpacing = text.letterSpacing ?? DEFAULTS.text.letterSpacing;
	const lineHeightPx =
		scaledFontSize * (text.lineHeight ?? DEFAULTS.text.lineHeight);
	const fontSizeRatio = text.fontSize / 15;

	return {
		scaledFontSize,
		fontString: buildTextFontString({
			fontFamily: text.fontFamily,
			fontWeight,
			fontStyle,
			scaledFontSize,
		}),
		letterSpacing,
		lineHeightPx,
		fontSizeRatio,
		textAlign: text.textAlign,
		textDecoration: text.textDecoration ?? "none",
	};
}

export function measureTextLayout({
	text,
	canvasHeight,
	ctx,
}: {
	text: TextLayoutParams;
	canvasHeight: number;
	ctx: TextCanvasContext;
}): MeasuredTextLayout {
	const resolvedLayout = resolveTextLayout({ text, canvasHeight });
	const lines = text.content.split("\n");

	ctx.save();
	ctx.font = resolvedLayout.fontString;
	ctx.textBaseline = "middle";
	setCanvasLetterSpacing({
		ctx,
		letterSpacingPx: resolvedLayout.letterSpacing,
	});
	const lineMetrics = lines.map((line) => ctx.measureText(line));
	ctx.restore();

	const block = measureTextBlock({
		lineMetrics,
		lineHeightPx: resolvedLayout.lineHeightPx,
	});

	return {
		...resolvedLayout,
		lines,
		lineMetrics,
		block,
	};
}

/** Canvas shadows ignore the current transform, so scale the font-relative values by it */
function applyTextShadow({
	ctx,
	shadow,
	scaledFontSize,
}: {
	ctx: TextCanvasContext;
	shadow: TextShadow;
	scaledFontSize: number;
}): void {
	const matrix = ctx.getTransform();
	const unit = (scaledFontSize / 100) * Math.hypot(matrix.a, matrix.b);
	ctx.shadowColor = shadow.color;
	ctx.shadowBlur = shadow.blur * unit;
	ctx.shadowOffsetX = shadow.offsetX * unit;
	ctx.shadowOffsetY = shadow.offsetY * unit;
}

function clearTextShadow({ ctx }: { ctx: TextCanvasContext }): void {
	ctx.shadowColor = "transparent";
	ctx.shadowBlur = 0;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 0;
}

export function drawMeasuredTextLayout({
	ctx,
	layout,
	textColor,
	fillOpacity = 1,
	background,
	backgroundColor,
	stroke,
	shadow,
	textBaseline = "middle",
	units = null,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	/**
	 * 0~1, applies to the glyph fill only. Below 1 with an outline or shadow,
	 * the glyphs are cut out of what is already on ctx, so ctx must hold only this text
	 */
	fillOpacity?: number;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
	/** width is a percentage of the font size */
	stroke?: { color: string; width: number } | null;
	/** blur and offsets are percentages of the font size */
	shadow?: TextShadow | null;
	textBaseline?: CanvasTextBaseline;
	/**
	 * 유닛 애니메이션 조각. 있으면 줄 대신 조각마다 따로 그린다(정지 구간 포함, 글리프가 바뀌지 않게).
	 * 배경은 전체 크기로 한 번 그린다. 이때도 ctx에는 이 텍스트만 있어야 한다
	 */
	units?: readonly ResolvedTextUnit[] | null;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = units ? "left" : layout.textAlign;
	ctx.textBaseline = textBaseline;
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	const outline = stroke && stroke.width > 0 ? stroke : null;
	const opacity = clamp({ value: fillOpacity, min: 0, max: 1 });
	const glyphs = { layout, textColor, outline, shadow, units: null as GlyphUnits };
	if (!units) {
		drawGlyphLayers({ ctx, glyphs, fillOpacity: opacity, background, backgroundColor });
		return;
	}

	// 줄 그리기처럼 한 줄을 다 그린 뒤 다음 줄로 넘어간다(아래 줄의 그림자가 위 줄 글자를 덮을 수 있다).
	// 한 줄 안에서는 그림자를 투명도와 상관없이 먼저 깔아(조각 투명도만큼) 투명도가 1이 되는 순간
	// 그림자와 글자의 앞뒤가 바뀌지 않게 하고, 본체는 불투명 조각을 줄 그리기와 같은 합성으로 한 번에,
	// 반투명 조각은 투명도가 같은 것끼리 묶어 따로 합성해 얹는다.
	// ponytail: 채움 투명도 < 1의 지우기 합성을 줄마다 한다. 줄 그리기는 모든 줄을 한 번에 지우므로
	// 줄끼리 겹치고 외곽선이나 그림자가 있을 때만 다르다
	const cutsFill = opacity < 1 && (outline !== null || Boolean(shadow));
	const lines = new Map<number, ResolvedTextUnit[]>();
	for (const unit of units) {
		const line = lines.get(unit.line);
		if (line) line.push(unit);
		else lines.set(unit.line, [unit]);
	}
	for (const lineUnits of lines.values()) {
		if (shadow) {
			drawUnitShadows({ ctx, layout, units: lineUnits, shadow, outline, textColor });
		}
		const opaque = lineUnits.filter((unit) => unit.opacity >= 1);
		drawGlyphLayers({ ctx, glyphs: { ...glyphs, units: opaque }, fillOpacity: opacity });
		// 묶음 안에서는 불투명할 때처럼 외곽선을 모두 먼저, 채움을 나중에 그려, 같은 단어처럼
		// 한꺼번에 불투명해지는 묶음은 그 순간 겹친 글자의 앞뒤가 바뀌지 않는다
		const translucent = new Map<number, ResolvedTextUnit[]>();
		for (const unit of lineUnits) {
			if (unit.opacity <= 0 || unit.opacity >= 1) continue;
			const group = translucent.get(unit.opacity);
			if (group) group.push(unit);
			else translucent.set(unit.opacity, [unit]);
		}
		for (const [alpha, group] of translucent) {
			if (shadow) {
				// 반투명 글자 속으로 자기 그림자가 비치지 않게, 본체가 덮을 자리(외곽선과 채움)를 먼저 비운다.
				// 불투명할 때 본체가 그 자리를 덮는 것과 같아 투명도 1에서 이어진다
				ctx.save();
				ctx.globalCompositeOperation = "destination-out";
				drawTextUnits({ ctx, layout, units: group, textColor, fillOpacity: 1, outline, decorate: false });
				ctx.restore();
			} else if (cutsFill) {
				// 불투명 조각은 채움 자리를 지운다. 반투명 조각도 투명도만큼 지워 1이 될 때 이어지게 한다
				ctx.save();
				ctx.globalCompositeOperation = "destination-out";
				ctx.globalAlpha *= alpha;
				drawTextUnits({ ctx, layout, units: group, textColor, fillOpacity: 1, decorate: false });
				ctx.restore();
			}
			drawTranslucentUnit({ ctx, glyphs: { ...glyphs, units: group }, fillOpacity: opacity, alpha });
		}
	}
	// 배경은 맨 아래에 깐다. 위의 채움 지우기가 배경까지 뚫지 않고, 배경이 그림자를 덮지 않는다
	ctx.save();
	ctx.globalCompositeOperation = "destination-over";
	drawTextBackground({ ctx, layout, background, backgroundColor });
	ctx.restore();
}

/**
 * 조각마다 그림자만 그린다(외곽선이 있으면 외곽선, 없으면 채움 모양의 그림자). 모양은 캔버스 밖으로 밀고
 * 그림자를 같은 거리만큼 되돌려 본체가 두 번 합성되지 않게 한다
 */
function drawUnitShadows({
	ctx,
	layout,
	units,
	shadow,
	outline,
	textColor,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	units: readonly ResolvedTextUnit[];
	shadow: TextShadow;
	outline: { color: string; width: number } | null;
	textColor: string;
}): void {
	const away = 2 * (ctx.canvas.width + ctx.canvas.height);
	const baseAlpha = ctx.globalAlpha;
	ctx.fillStyle = textColor;
	for (const unit of units) {
		if (unit.opacity <= 0) continue;
		withUnitTransform({
			ctx,
			layout,
			unit,
			draw: () => {
				ctx.globalAlpha = baseAlpha * Math.min(1, unit.opacity);
				applyTextShadow({ ctx, shadow, scaledFontSize: layout.scaledFontSize });
				const matrix = ctx.getTransform();
				ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e + away, matrix.f);
				ctx.shadowOffsetX -= away;
				if (outline) {
					ctx.strokeStyle = outline.color;
					ctx.lineWidth = ((layout.scaledFontSize * outline.width) / 100) * 2;
					ctx.lineJoin = "round";
					ctx.strokeText(unit.text, -unit.width / 2, 0);
				} else {
					ctx.fillText(unit.text, -unit.width / 2, 0);
				}
				ctx.setTransform(matrix);
				clearTextShadow({ ctx });
			},
		});
	}
	ctx.globalAlpha = baseAlpha;
}

type GlyphUnits = readonly ResolvedTextUnit[] | null;

interface GlyphSource {
	layout: MeasuredTextLayout;
	textColor: string;
	outline: { color: string; width: number } | null;
	shadow: TextShadow | null | undefined;
	units: GlyphUnits;
}

/** 줄(또는 조각)을 배경, 외곽선, 그림자, 채움 투명도까지 합성해 그린다 */
function drawGlyphLayers({
	ctx,
	glyphs,
	fillOpacity: opacity,
	background,
	backgroundColor,
}: {
	ctx: TextCanvasContext;
	glyphs: GlyphSource;
	fillOpacity: number;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
}): void {
	const { layout, textColor, outline, shadow, units } = glyphs;
	const drawTextLines = (options: {
		ctx: TextCanvasContext;
		layout: MeasuredTextLayout;
		textColor: string;
		fillOpacity: number;
		outline?: { color: string; width: number } | null;
		shadow?: TextShadow | null;
		decorate?: boolean;
	}) => (units ? drawTextUnits({ ...options, units }) : drawTextRows(options));
	if (opacity >= 1 || (!outline && !shadow)) {
		drawTextBackground({ ctx, layout, background, backgroundColor });
		drawTextLines({ ctx, layout, textColor, fillOpacity: opacity, outline, shadow });
		return;
	}

	// The outline and shadow must not fade with the letters, and the outline's inner
	// half must not show through them: draw both from opaque glyphs, cut the glyphs
	// out, slide the background underneath, then fill the holes with the faded glyphs
	drawTextLines({
		ctx,
		layout,
		textColor,
		fillOpacity: 1,
		outline,
		shadow,
		decorate: false,
	});
	ctx.globalCompositeOperation = "destination-out";
	drawTextLines({ ctx, layout, textColor, fillOpacity: 1, decorate: false });
	ctx.globalCompositeOperation = "destination-over";
	drawTextBackground({ ctx, layout, background, backgroundColor });
	ctx.globalCompositeOperation = "source-over";
	drawTextLines({ ctx, layout, textColor, fillOpacity: opacity });
}

function drawTextBackground({
	ctx,
	layout,
	background,
	backgroundColor,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	background?: ResolvedTextBackgroundLike | null;
	backgroundColor?: string;
}): void {
	if (
		!background?.enabled ||
		!backgroundColor ||
		backgroundColor === "transparent" ||
		layout.lines.length === 0
	) {
		return;
	}
	const backgroundRect = getTextBackgroundRect({
		block: layout.block,
		background: {
			...background,
			color: backgroundColor,
		},
		fontSizeRatio: layout.fontSizeRatio,
	});
	if (!backgroundRect) return;
	const p =
		clamp({
			value: background.cornerRadius,
			min: CORNER_RADIUS_MIN,
			max: CORNER_RADIUS_MAX,
		}) / 100;
	const radius =
		(Math.min(backgroundRect.width, backgroundRect.height) / 2) * p;
	ctx.fillStyle = backgroundColor;
	ctx.beginPath();
	ctx.roundRect(
		backgroundRect.left,
		backgroundRect.top,
		backgroundRect.width,
		backgroundRect.height,
		radius,
	);
	ctx.fill();
}

function drawTextRows({
	ctx,
	layout,
	textColor,
	fillOpacity,
	outline = null,
	shadow = null,
	decorate = true,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	textColor: string;
	fillOpacity: number;
	outline?: { color: string; width: number } | null;
	shadow?: TextShadow | null;
	decorate?: boolean;
}): void {
	ctx.fillStyle = textColor;
	const baseAlpha = ctx.globalAlpha;
	const lineX = getLineX({ textAlign: layout.textAlign, block: layout.block });
	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		// cast the shadow once per line, from the outline when there is one so it is not doubled
		if (shadow) applyTextShadow({ ctx, shadow, scaledFontSize: layout.scaledFontSize });
		if (outline) {
			// stroke is centered on the glyph edge and the fill covers the inner half, so double it
			ctx.strokeStyle = outline.color;
			ctx.lineWidth = ((layout.scaledFontSize * outline.width) / 100) * 2;
			ctx.lineJoin = "round";
			ctx.strokeText(layout.lines[index], lineX, lineY);
			clearTextShadow({ ctx });
		}
		ctx.globalAlpha = baseAlpha * fillOpacity;
		ctx.fillText(layout.lines[index], lineX, lineY);
		clearTextShadow({ ctx });
		if (decorate) {
			drawTextDecoration({
				ctx,
				textDecoration: layout.textDecoration,
				lineWidth: layout.lineMetrics[index].width,
				lineX,
				lineY,
				metrics: layout.lineMetrics[index],
				scaledFontSize: layout.scaledFontSize,
				textAlign: layout.textAlign,
			});
		}
		ctx.globalAlpha = baseAlpha;
	}
}

/** 조각이 놓일 줄 왼쪽 끝 x. 줄 그리기에서 textAlign으로 맞추던 자리와 같다 */
function getLineLeft({ layout, line }: { layout: MeasuredTextLayout; line: number }): number {
	const lineX = getLineX({ textAlign: layout.textAlign, block: layout.block });
	const width = layout.lineMetrics[line]?.width ?? 0;
	if (layout.textAlign === "center") return lineX - width / 2;
	if (layout.textAlign === "right") return lineX - width;
	return lineX;
}

/** 조각 가운데를 원점으로 옮긴 좌표계에서 draw를 부른다. 조각 왼쪽 끝은 -width/2 */
function withUnitTransform({
	ctx,
	layout,
	unit,
	draw,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	unit: ResolvedTextUnit;
	draw: () => void;
}): void {
	const lineY = unit.line * layout.lineHeightPx - layout.block.visualCenterOffset;
	ctx.save();
	ctx.translate(getLineLeft({ layout, line: unit.line }) + unit.x + unit.width / 2 + unit.dx, lineY + unit.dy);
	if (unit.rotate) ctx.rotate((unit.rotate * Math.PI) / 180);
	if (unit.scale !== 1) ctx.scale(unit.scale, unit.scale);
	draw();
	ctx.restore();
}

/**
 * drawTextRows를 조각 단위로. 줄 그리기처럼 이웃 글자의 외곽선이 채움을 덮지 않도록 외곽선 → 채움
 * 순서로 조각 전체를 차례로 훑는다. 그림자는 drawUnitShadows가 미리 깔아 여기서는 그리지 않는다
 */
function drawTextUnits({
	ctx,
	layout,
	units,
	textColor,
	fillOpacity,
	outline = null,
	decorate = true,
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	units: readonly ResolvedTextUnit[];
	textColor: string;
	fillOpacity: number;
	outline?: { color: string; width: number } | null;
	shadow?: TextShadow | null;
	decorate?: boolean;
}): void {
	ctx.fillStyle = textColor;
	const baseAlpha = ctx.globalAlpha;
	const strokeShape = (unit: ResolvedTextUnit) => {
		ctx.strokeStyle = outline?.color ?? textColor;
		ctx.lineWidth = ((layout.scaledFontSize * (outline?.width ?? 0)) / 100) * 2;
		ctx.lineJoin = "round";
		ctx.strokeText(unit.text, -unit.width / 2, 0);
	};
	const forEachUnit = (lineUnits: readonly ResolvedTextUnit[], draw: (unit: ResolvedTextUnit) => void) => {
		for (const unit of lineUnits) withUnitTransform({ ctx, layout, unit, draw: () => draw(unit) });
	};

	// 줄 그리기처럼 한 줄의 외곽선을 모두 그린 뒤 그 줄의 채움을 그리고 다음 줄로 넘어간다
	const lines = new Map<number, ResolvedTextUnit[]>();
	for (const unit of units) {
		const line = lines.get(unit.line);
		if (line) line.push(unit);
		else lines.set(unit.line, [unit]);
	}
	for (const lineUnits of lines.values()) {
		if (outline) forEachUnit(lineUnits, strokeShape);
		ctx.globalAlpha = baseAlpha * fillOpacity;
		forEachUnit(lineUnits, (unit) => {
			ctx.fillText(unit.text, -unit.width / 2, 0);
			const metrics = layout.lineMetrics[unit.line];
			if (decorate && metrics) {
				drawTextDecoration({
					ctx,
					textDecoration: layout.textDecoration,
					lineWidth: unit.width,
					lineX: -unit.width / 2,
					lineY: 0,
					metrics,
					scaledFontSize: layout.scaledFontSize,
					textAlign: "left",
				});
			}
		});
		ctx.globalAlpha = baseAlpha;
	}
}

let translucentCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;

/**
 * 반투명 조각 묶음을 임시 캔버스에 불투명하게 합성한 뒤 alpha로 얹는다.
 * 외곽선 안쪽 절반이 비치거나 채움 투명도 합성(destination-out)이 이웃 조각을 지우지 않는다
 * ponytail: 묶음마다 캔버스 전체 크기로 그린다. 투명도가 제각각인 조각이 많은 프리셋이 느려지면 조각 영역만 쓰게 줄인다
 */
function drawTranslucentUnit({
	ctx,
	glyphs,
	fillOpacity,
	alpha,
}: {
	ctx: TextCanvasContext;
	glyphs: GlyphSource;
	fillOpacity: number;
	alpha: number;
}): void {
	const { width, height } = ctx.canvas;
	if (!translucentCanvas) {
		translucentCanvas =
			typeof OffscreenCanvas !== "undefined"
				? new OffscreenCanvas(width, height)
				: document.createElement("canvas");
	}
	if (translucentCanvas.width !== width) translucentCanvas.width = width;
	if (translucentCanvas.height !== height) translucentCanvas.height = height;
	const temp = translucentCanvas.getContext("2d") as TextCanvasContext | null;
	if (!temp) return;
	temp.setTransform(1, 0, 0, 1, 0, 0);
	temp.clearRect(0, 0, width, height);
	temp.setTransform(ctx.getTransform());
	temp.font = ctx.font;
	temp.textAlign = "left";
	temp.textBaseline = ctx.textBaseline;
	temp.globalAlpha = 1;
	temp.globalCompositeOperation = "source-over";
	setCanvasLetterSpacing({ ctx: temp, letterSpacingPx: glyphs.layout.letterSpacing });
	drawGlyphLayers({ ctx: temp, glyphs, fillOpacity });

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha *= alpha;
	ctx.drawImage(translucentCanvas, 0, 0);
	ctx.restore();
}

export function strokeMeasuredTextLayout({
	ctx,
	layout,
	strokeColor,
	strokeWidth,
	textBaseline = "middle",
}: {
	ctx: TextCanvasContext;
	layout: MeasuredTextLayout;
	strokeColor: string;
	strokeWidth: number;
	textBaseline?: CanvasTextBaseline;
}): void {
	ctx.font = layout.fontString;
	ctx.textAlign = layout.textAlign;
	ctx.textBaseline = textBaseline;
	ctx.strokeStyle = strokeColor;
	ctx.lineWidth = strokeWidth;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	setCanvasLetterSpacing({ ctx, letterSpacingPx: layout.letterSpacing });

	const lineX = getLineX({ textAlign: layout.textAlign, block: layout.block });
	for (let index = 0; index < layout.lines.length; index++) {
		const lineY = index * layout.lineHeightPx - layout.block.visualCenterOffset;
		ctx.strokeText(layout.lines[index], lineX, lineY);
	}
}
