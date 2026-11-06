/* @ts-self-types="./opencut_wasm.d.ts" */

import * as wasm from "./opencut_wasm_bg.wasm";
import { __wbg_set_wasm } from "./opencut_wasm_bg.js";
__wbg_set_wasm(wasm);
wasm.__wbindgen_start();
export {
    TEXT_ANIMATION_DEFAULT_DURATION, TEXT_ANIMATION_DEFAULT_LOOP_PERIOD, TEXT_ANIMATION_MIN_DURATION, TICKS_PER_SECOND, applyEffectPasses, applyMaskFeather, floorToFrame, formatTimecode, getCompositorCanvas, getLastFrameProfile, guessTimecodeFormat, initCompositor, initializeGpu, isFrameAligned, lastFrameTime, mediaTimeAdd, mediaTimeClamp, mediaTimeFromFrame, mediaTimeFromSeconds, mediaTimeMax, mediaTimeMin, mediaTimeSub, mediaTimeToFrame, mediaTimeToSeconds, parseTimecode, releaseTexture, renderFrame, resizeCompositor, resolveTextAnimation, roundToFrame, snappedSeekTime, textAnimationEffectiveDurations, textAnimationPresets, textAnimationSliderRange, uploadTexture
} from "./opencut_wasm_bg.js";
