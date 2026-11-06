"use client";

import { memo, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { TextCanvasContext } from "@/text/layout";
import { drawMeasuredTextLayout, measureTextLayout } from "@/text/primitives";
import { FONT_SIZE_SCALE_REFERENCE } from "@/text/typography";
import { mediaTimeFromSeconds, resolveTextAnimation, type TextAnimation } from "@/wasm";
import { resolveTextUnits, type TextAnimationSlot } from "../text-animation";

const THUMBNAIL_PIXELS = 128;
/** 글자 크기를 썸네일 한 변에 대한 비율로 */
const FONT_RATIO = 0.24;
/** 썸네일 속 클립 하나의 길이이자 인/아웃 길이, 반복 주기 */
const DEMO_SECONDS = 1;
/** 마우스를 올렸을 때 인은 다 나타난 뒤, 아웃은 사라지기 전에 이만큼 멈춘다 */
const HOLD_SECONDS = 0.6;
/** 평소 보여 주는 정지 화면의 진행 지점 */
const STILL_PROGRESS: Record<TextAnimationSlot, number> = { in: 0.3, out: 0.7, loop: 0.25 };

function demoAnimation(slot: TextAnimationSlot, type: string): TextAnimation {
	return slot === "loop"
		? { loop: { type, period: DEMO_SECONDS } }
		: { [slot]: { type, duration: DEMO_SECONDS } };
}

/** 마우스를 올린 뒤 elapsed초가 지났을 때 썸네일 클립의 로컬 시간(초) */
function demoSeconds(slot: TextAnimationSlot, elapsed: number): number {
	if (slot === "loop") return elapsed % DEMO_SECONDS;
	const phase = elapsed % (DEMO_SECONDS + HOLD_SECONDS);
	return slot === "in" ? Math.min(phase, DEMO_SECONDS) : Math.max(0, phase - HOLD_SECONDS);
}

/** 렌더러와 같은 엔진과 같은 그리기로 썸네일 한 장을 그린다 */
export function drawTextAnimationThumbnail({
	ctx,
	slot,
	type,
	seconds,
	content,
	fontFamily,
	color,
}: {
	ctx: TextCanvasContext;
	slot: TextAnimationSlot;
	type: string;
	seconds: number;
	content: string;
	fontFamily: string;
	color: string;
}): void {
	const size = ctx.canvas.width;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, size, ctx.canvas.height);
	// canvasHeight가 기준값이면 fontSize가 그대로 px가 된다
	const layout = measureTextLayout({
		text: {
			content,
			fontSize: size * FONT_RATIO,
			fontFamily,
			fontWeight: "bold",
			fontStyle: "normal",
			textAlign: "center",
		},
		canvasHeight: FONT_SIZE_SCALE_REFERENCE,
		ctx,
	});
	const animation = demoAnimation(slot, type);
	const localTime = mediaTimeFromSeconds({ seconds });
	const duration = mediaTimeFromSeconds({ seconds: DEMO_SECONDS });
	const state = resolveTextAnimation({
		animation,
		localSeconds: seconds,
		clipSeconds: DEMO_SECONDS,
	});
	const units = resolveTextUnits({ animation, localTime, duration, layout, ctx });

	ctx.save();
	ctx.translate(
		size / 2 + state.dx * layout.block.maxWidth,
		ctx.canvas.height / 2 + state.dy * layout.block.height,
	);
	ctx.scale(state.scale, state.scale);
	ctx.rotate((state.rotate * Math.PI) / 180);
	ctx.globalAlpha = state.opacity;
	const sigma = state.blur * layout.block.height * state.scale;
	if (sigma > 0) ctx.filter = `blur(${sigma}px)`;
	drawMeasuredTextLayout({ ctx, layout, textColor: color, units });
	ctx.restore();
}

/**
 * 프리셋 칸의 썸네일. 평소에는 정지 화면, isPlaying이면 반복 재생한다.
 * 글자색은 칸의 CSS color를 따라 선택(isActive)이나 테마가 바뀌면 다시 그린다
 */
export const TextAnimationThumbnail = memo(function TextAnimationThumbnail({
	slot,
	type,
	content,
	fontFamily,
	isPlaying,
	isActive,
}: {
	slot: TextAnimationSlot;
	type: string;
	content: string;
	fontFamily: string;
	isPlaying: boolean;
	isActive: boolean;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const draw = (seconds: number) =>
			drawTextAnimationThumbnail({
				ctx,
				slot,
				type,
				seconds,
				content,
				fontFamily,
				color: getComputedStyle(canvas).color,
			});
		if (!isPlaying) {
			const still = () => draw(STILL_PROGRESS[slot] * DEMO_SECONDS);
			still();
			// 폰트가 늦게 들어오면 대체 글꼴로 그린 정지 화면을 다시 그린다
			let cancelled = false;
			void document.fonts?.ready.then(() => {
				if (!cancelled) still();
			});
			return () => {
				cancelled = true;
			};
		}
		const start = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			draw(demoSeconds(slot, (now - start) / 1000));
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [slot, type, content, fontFamily, isPlaying, isActive, resolvedTheme]);

	return (
		<canvas
			ref={canvasRef}
			width={THUMBNAIL_PIXELS}
			height={THUMBNAIL_PIXELS}
			className="size-full"
		/>
	);
});
