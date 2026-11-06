import {
	TEXT_ANIMATION_DEFAULT_DURATION as _TEXT_ANIMATION_DEFAULT_DURATION,
	TEXT_ANIMATION_DEFAULT_LOOP_PERIOD as _TEXT_ANIMATION_DEFAULT_LOOP_PERIOD,
	TEXT_ANIMATION_MIN_DURATION as _TEXT_ANIMATION_MIN_DURATION,
} from "opencut-wasm";

/** 인/아웃/반복 애니메이션 계산은 `rust/crates/text-animation`에 있다. 시간은 모두 초 단위다 */
export {
	resolveTextAnimation,
	textAnimationEffectiveDurations,
	textAnimationPresets,
	textAnimationSliderRange,
	type TextAnimation,
	type UnitState,
} from "opencut-wasm";

export const TEXT_ANIMATION_DEFAULT_DURATION = _TEXT_ANIMATION_DEFAULT_DURATION();
export const TEXT_ANIMATION_MIN_DURATION = _TEXT_ANIMATION_MIN_DURATION();
export const TEXT_ANIMATION_DEFAULT_LOOP_PERIOD = _TEXT_ANIMATION_DEFAULT_LOOP_PERIOD();
