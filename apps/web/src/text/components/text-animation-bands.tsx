import type { TextElement } from "@/timeline/types";
import { TICKS_PER_SECOND, textAnimationEffectiveDurations } from "@/wasm";

/** 타임라인 텍스트 클립 위에 인 구간(앞), 아웃 구간(뒤), 반복(아래 선)을 반투명하게 그린다 */
export function TextAnimationBands({
	element,
	pixelsPerSecond,
}: {
	element: TextElement;
	pixelsPerSecond: number;
}) {
	const animation = element.textAnimation;
	if (!animation) return null;
	const { inSeconds, outSeconds } = textAnimationEffectiveDurations({
		animation,
		clipSeconds: element.duration / TICKS_PER_SECOND,
	});
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0">
			{inSeconds > 0 && (
				<div
					className="absolute inset-y-0 left-0 bg-white/25"
					style={{ width: inSeconds * pixelsPerSecond }}
				/>
			)}
			{outSeconds > 0 && (
				<div
					className="absolute inset-y-0 right-0 bg-white/25"
					style={{ width: outSeconds * pixelsPerSecond }}
				/>
			)}
			{animation.loop && (
				<div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/60" />
			)}
		</div>
	);
}
