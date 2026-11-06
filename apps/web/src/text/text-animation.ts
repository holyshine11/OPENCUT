import { buildGaussianBlurPasses } from "@/effects/definitions/blur";
import type { EffectPass } from "@/effects/types";
import type { Transform } from "@/rendering";
import type { TextElement } from "@/timeline/types";
import {
	resolveTextAnimation,
	TICKS_PER_SECOND,
	type TextAnimation,
} from "@/wasm";

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
