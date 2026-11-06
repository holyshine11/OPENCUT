//! 프리셋 모양. 인/아웃은 같은 "드러남" 프리셋을 쓰고, 아웃은 진행도를 거꾸로 넣는다.
//! dx/dy는 텍스트 박스 너비/높이 비율, blur는 텍스트 높이 비율, rotate는 도 단위다.

use std::f64::consts::TAU;

use crate::UnitState;

const SLIDE_DISTANCE: f64 = 0.6;
const ZOOM_IN_START_SCALE: f64 = 0.3;
const ZOOM_OUT_START_SCALE: f64 = 1.6;
const ROTATE_START_DEGREES: f64 = -90.0;
const ROTATE_START_SCALE: f64 = 0.6;
const BLUR_START: f64 = 0.25;
const BOUNCE_DROP: f64 = 1.2;
/// 드러남 진행도의 이 앞부분 동안 투명도가 0에서 1로 오른다
const QUICK_FADE_PORTION: f64 = 0.35;

const WIGGLE_DEGREES: f64 = 6.0;
const PULSE_SCALE: f64 = 0.08;
const BLINK_MIN_OPACITY: f64 = 0.35;
const FLOAT_DISTANCE: f64 = 0.08;

/// 인/아웃 프리셋 id. UI 이름은 웹 i18n에서 id로 찾는다
pub const REVEAL_PRESETS: &[&str] = &[
    "fade",
    "zoomIn",
    "zoomOut",
    "slideLeft",
    "slideRight",
    "slideUp",
    "slideDown",
    "rotate",
    "blur",
    "pop",
    "bounce",
];

/// 반복 프리셋 id
pub const LOOP_PRESETS: &[&str] = &["wiggle", "pulse", "blink", "float"];

fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

fn ease_out_back(t: f64) -> f64 {
    const OVERSHOOT: f64 = 1.70158;
    let u = t - 1.0;
    1.0 + (OVERSHOOT + 1.0) * u.powi(3) + OVERSHOOT * u.powi(2)
}

fn ease_out_bounce(t: f64) -> f64 {
    const N: f64 = 7.5625;
    const D: f64 = 2.75;
    if t < 1.0 / D {
        N * t * t
    } else if t < 2.0 / D {
        let u = t - 1.5 / D;
        N * u * u + 0.75
    } else if t < 2.5 / D {
        let u = t - 2.25 / D;
        N * u * u + 0.9375
    } else {
        let u = t - 2.625 / D;
        N * u * u + 0.984375
    }
}

fn quick_fade(t: f64) -> f64 {
    (t / QUICK_FADE_PORTION).min(1.0)
}

/// t: 0이면 완전히 숨은 시작 상태, 1이면 원래 모습. 모르는 id면 None
pub fn sample_reveal(id: &str, t: f64) -> Option<UnitState> {
    let t = t.clamp(0.0, 1.0);
    let e = ease_out_cubic(t);
    let rest = 1.0 - e;
    let base = UnitState::IDENTITY;
    let state = match id {
        "fade" => UnitState { opacity: e, ..base },
        "zoomIn" => UnitState {
            scale: ZOOM_IN_START_SCALE + (1.0 - ZOOM_IN_START_SCALE) * e,
            opacity: quick_fade(t),
            ..base
        },
        "zoomOut" => UnitState {
            scale: ZOOM_OUT_START_SCALE + (1.0 - ZOOM_OUT_START_SCALE) * e,
            opacity: quick_fade(t),
            ..base
        },
        "slideLeft" => UnitState { dx: SLIDE_DISTANCE * rest, opacity: e, ..base },
        "slideRight" => UnitState { dx: -SLIDE_DISTANCE * rest, opacity: e, ..base },
        "slideUp" => UnitState { dy: SLIDE_DISTANCE * rest, opacity: e, ..base },
        "slideDown" => UnitState { dy: -SLIDE_DISTANCE * rest, opacity: e, ..base },
        "rotate" => UnitState {
            rotate: ROTATE_START_DEGREES * rest,
            scale: ROTATE_START_SCALE + (1.0 - ROTATE_START_SCALE) * e,
            opacity: quick_fade(t),
            ..base
        },
        "blur" => UnitState { blur: BLUR_START * rest, opacity: e, ..base },
        "pop" => UnitState { scale: ease_out_back(t), opacity: quick_fade(t), ..base },
        "bounce" => UnitState {
            dy: -BOUNCE_DROP * (1.0 - ease_out_bounce(t)),
            opacity: quick_fade(t),
            ..base
        },
        _ => return None,
    };
    Some(state)
}

/// phase: 한 바퀴 안의 위치(0~1). 모르는 id면 None
pub fn sample_loop(id: &str, phase: f64) -> Option<UnitState> {
    let wave = (TAU * phase).sin();
    let base = UnitState::IDENTITY;
    let state = match id {
        "wiggle" => UnitState { rotate: WIGGLE_DEGREES * wave, ..base },
        "pulse" => UnitState { scale: 1.0 + PULSE_SCALE * wave, ..base },
        "blink" => UnitState {
            opacity: BLINK_MIN_OPACITY
                + (1.0 - BLINK_MIN_OPACITY) * (0.5 + 0.5 * (TAU * phase).cos()),
            ..base
        },
        "float" => UnitState { dy: FLOAT_DISTANCE * wave, ..base },
        _ => return None,
    };
    Some(state)
}
