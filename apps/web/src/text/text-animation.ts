import { buildGaussianBlurPasses } from "@/effects/definitions/blur";
import type { EffectPass } from "@/effects/types";
import type { Transform } from "@/rendering";
import { DEFAULTS } from "@/timeline/defaults";
import type { TextElement } from "@/timeline/types";
import {
	resolveTextAnimation,
	TICKS_PER_SECOND,
	textAnimationEffectiveDurations,
	type TextAnimation,
} from "@/wasm";

export type RevealSide = "in" | "out";
export type TextAnimationSlot = RevealSide | "loop";

/** 저장값은 검증 없이 들어오므로 문자열이나 빈 값도 걸러 낸다 */
export const isPositive = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value > 0;

function withoutEmptySlots(
	animation: TextAnimation,
): TextAnimation | undefined {
	const kept = Object.fromEntries(
		Object.entries(animation).filter(([, slot]) => slot !== undefined),
	) as TextAnimation;
	return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * 자른 자리에서는 다시 등장하거나 퇴장하지 않는다. 왼쪽 조각은 인, 오른쪽 조각은 아웃만 갖고 반복은 둘 다 갖는다.
 * 타임라인 분할과 자막 목록 분할이 함께 쓴다
 */
export function splitTextAnimation({
	animation,
	rightStartSeconds,
}: {
	animation: TextAnimation | undefined;
	/** 오른쪽 조각이 원래 클립 시작에서 몇 초 뒤에 시작하는지. 반복이 끊기지 않고 이어 돌게 한다 */
	rightStartSeconds: number;
}): { left: TextAnimation | undefined; right: TextAnimation | undefined } {
	if (!animation) return { left: undefined, right: undefined };
	const { loop } = animation;
	return {
		left: withoutEmptySlots({ in: animation.in, loop }),
		right: withoutEmptySlots({
			out: animation.out,
			loop: loop && { ...loop, offset: (loop.offset ?? 0) + rightStartSeconds },
		}),
	};
}

/** 요소에 textAnimation을 넣거나(값이 있을 때) 뺀 사본. 빈 키를 남기지 않는다 */
export function withTextAnimation<T extends Partial<TextElement>>({
	element,
	animation,
}: {
	element: T;
	animation: TextAnimation | undefined;
}): T {
	const { textAnimation: _previous, ...rest } = element;
	return (animation ? { ...rest, textAnimation: animation } : rest) as T;
}

/**
 * 키프레임으로 구한 transform/opacity 위에 애니메이션을 덧씌운다.
 * localTime, duration은 틱이고 box는 변환 전 텍스트 박스(px)다
 */
export function applyTextAnimation({
	animation,
	localTime,
	duration,
	transform,
	opacity,
	box,
}: {
	animation: TextAnimation | undefined;
	localTime: number;
	duration: number;
	transform: Transform;
	opacity: number;
	box: { width: number; height: number };
}): { transform: Transform; opacity: number; blurPasses: EffectPass[] } {
	if (!animation) return { transform, opacity, blurPasses: [] };
	const state = resolveTextAnimation({
		animation,
		localSeconds: localTime / TICKS_PER_SECOND,
		clipSeconds: duration / TICKS_PER_SECOND,
	});
	const scaleX = transform.scaleX * state.scale;
	const scaleY = transform.scaleY * state.scale;
	const sigma = state.blur * box.height * Math.abs(scaleY);
	return {
		transform: {
			...transform,
			position: {
				x: transform.position.x + state.dx * box.width * transform.scaleX,
				y: transform.position.y + state.dy * box.height * transform.scaleY,
			},
			scaleX,
			scaleY,
			rotate: transform.rotate + state.rotate,
		},
		opacity: opacity * state.opacity,
		blurPasses: buildGaussianBlurPasses({ sigmaX: sigma, sigmaY: sigma }),
	};
}

/** 인/아웃 프리셋을 고르거나(type) 지운다(null). 이미 있던 길이는 유지하고, 없으면 기본 길이로 시작한다 */
export function withRevealPreset({
	animation,
	side,
	type,
}: {
	animation: TextAnimation | undefined;
	side: RevealSide;
	type: string | null;
}): TextAnimation | undefined {
	const current = animation ?? {};
	if (type === null) return withoutEmptySlots({ ...current, [side]: undefined });
	const existing = current[side]?.duration;
	return {
		...current,
		[side]: {
			type,
			duration: isPositive(existing) ? existing : DEFAULTS.text.animation.duration,
		},
	};
}

/**
 * 인/아웃 길이 슬라이더 값을 반영한다. 슬라이더는 클립에 맞춰 줄인 유효 길이를 보여 주므로
 * 인과 아웃을 둘 다 유효 길이로 저장해 저장값과 화면 값을 맞춘다
 */
export function withRevealDuration({
	animation,
	side,
	seconds,
	clipSeconds,
}: {
	animation: TextAnimation;
	side: RevealSide;
	seconds: number;
	clipSeconds: number;
}): TextAnimation {
	const effective = textAnimationEffectiveDurations({ animation, clipSeconds });
	const next = { ...animation };
	if (next.in) {
		next.in = { ...next.in, duration: side === "in" ? seconds : effective.inSeconds };
	}
	if (next.out) {
		next.out = { ...next.out, duration: side === "out" ? seconds : effective.outSeconds };
	}
	return next;
}

/** 반복 프리셋을 고르거나(type) 지운다(null). 주기는 이미 있던 값을 유지한다 */
export function withLoopPreset({
	animation,
	type,
}: {
	animation: TextAnimation | undefined;
	type: string | null;
}): TextAnimation | undefined {
	const current = animation ?? {};
	if (type === null) return withoutEmptySlots({ ...current, loop: undefined });
	const existing = current.loop;
	return {
		...current,
		loop: {
			...existing,
			type,
			period: isPositive(existing?.period)
				? existing.period
				: DEFAULTS.text.animation.loopPeriod,
		},
	};
}

/** 프리셋을 고른 뒤 프리뷰에서 한 번 재생할 구간(클립 시작 기준 초) */
export function textAnimationPreviewRange({
	animation,
	slot,
	clipSeconds,
}: {
	animation: TextAnimation;
	slot: TextAnimationSlot;
	clipSeconds: number;
}): { startSeconds: number; endSeconds: number } {
	const effective = textAnimationEffectiveDurations({ animation, clipSeconds });
	if (slot === "in") return { startSeconds: 0, endSeconds: effective.inSeconds };
	if (slot === "out") {
		return { startSeconds: clipSeconds - effective.outSeconds, endSeconds: clipSeconds };
	}
	const period = animation.loop?.period ?? DEFAULTS.text.animation.loopPeriod;
	return {
		startSeconds: 0,
		endSeconds: Math.min(clipSeconds, period * LOOP_PREVIEW_CYCLES),
	};
}

/** 반복 프리셋을 고르면 이만큼 돌려 보여 준다 */
const LOOP_PREVIEW_CYCLES = 2;
