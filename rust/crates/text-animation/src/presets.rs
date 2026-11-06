//! 프리셋 모양. 인/아웃은 같은 "드러남" 프리셋을 쓰고, 아웃은 진행도를 거꾸로 넣는다.
//! dx/dy는 텍스트 박스 너비/높이 비율, blur와 split은 텍스트 높이 비율, rotate는 도 단위다.

use std::f64::consts::{PI, TAU};

use crate::UnitState;
use crate::units::hash01;

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

const SPIN_IN_DEGREES: f64 = -360.0;
const JELLY_IN_STRETCH: f64 = 0.35;
/// 젤리 인이 끝날 때까지 출렁이는 반 바퀴 수
const JELLY_IN_HALF_WAVES: f64 = 3.0;
const SHAKE_IN_DISTANCE: f64 = 0.12;
const SHAKE_IN_HALF_WAVES: f64 = 7.0;
const ZOOM_BLUR_START_SCALE: f64 = 1.8;
/// 글리치가 한 번 드러나는 동안 화면이 바뀌는 횟수
const GLITCH_IN_STEPS: f64 = 12.0;
const GLITCH_JITTER: f64 = 0.15;
const GLITCH_SPLIT: f64 = 0.08;
/// 글리치 인에서 이보다 낮은 난수가 나온 칸은 글자가 꺼진다
const GLITCH_IN_DROPOUT: f64 = 0.35;

const HEARTBEAT_SCALE: f64 = 0.15;
/// 심장박동 두 번째 박동의 세기(첫 박동 대비)
const HEARTBEAT_SECOND_BEAT: f64 = 0.6;
const JELLY_STRETCH: f64 = 0.12;
const SHAKE_DISTANCE: f64 = 0.03;
/// 한 주기 동안 흔들리는 횟수
const SHAKE_CYCLES: f64 = 8.0;
/// 네온 깜빡임 한 주기를 이만큼 칸으로 나눠 칸마다 켜짐/꺼짐을 정한다
const FLICKER_STEPS: f64 = 10.0;
const FLICKER_DIM_OPACITY: f64 = 0.2;
/// 네온 깜빡임에서 이보다 낮은 난수가 나온 칸은 어두워진다
const FLICKER_DIM_CHANCE: f64 = 0.3;
const GLITCH_LOOP_STEPS: f64 = 20.0;
/// 글리치 반복 한 주기에서 화면이 튀는 구간(주기 비율). 나머지는 멀쩡하다
const GLITCH_LOOP_BURSTS: &[(f64, f64)] = &[(0.2, 0.3), (0.6, 0.65), (0.8, 0.85)];

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
    "flipX",
    "flipY",
    "spinIn",
    "elastic",
    "jellyIn",
    "shakeIn",
    "zoomBlur",
    "glitchIn",
];

/// 반복 프리셋 id
pub const LOOP_PRESETS: &[&str] = &[
    "wiggle", "pulse", "blink", "float", "heartbeat", "jelly", "spin", "shake", "flicker", "glitch",
];

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

fn ease_out_elastic(t: f64) -> f64 {
    const PERIOD: f64 = TAU / 3.0;
    if t <= 0.0 {
        0.0
    } else if t >= 1.0 {
        1.0
    } else {
        2f64.powf(-10.0 * t) * ((t * 10.0 - 0.75) * PERIOD).sin() + 1.0
    }
}

/// [start, end) 구간에서 0 → 1 → 0으로 한 번 솟는 모양
fn bump(x: f64, start: f64, end: f64) -> f64 {
    if (start..end).contains(&x) { (PI * (x - start) / (end - start)).sin() } else { 0.0 }
}

/// 진행도를 steps칸으로 나눈 칸 번호. 반복은 1.0이 0번 칸으로 돌아오게 한다
fn step_of(t: f64, steps: f64) -> u32 {
    ((t * steps).floor().rem_euclid(steps)) as u32
}

/// 칸마다 정해진 -1~1 난수
fn jitter(step: u32, salt: u32) -> f64 {
    hash01(step, salt) * 2.0 - 1.0
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
        "flipX" => UnitState { stretch_x: e, opacity: quick_fade(t), ..base },
        "flipY" => UnitState { stretch_y: e, opacity: quick_fade(t), ..base },
        "spinIn" => UnitState {
            rotate: SPIN_IN_DEGREES * rest,
            scale: e,
            opacity: quick_fade(t),
            ..base
        },
        "elastic" => UnitState { scale: ease_out_elastic(t), opacity: quick_fade(t), ..base },
        "jellyIn" => {
            let wobble = JELLY_IN_STRETCH * (PI * JELLY_IN_HALF_WAVES * t).sin() * (1.0 - t);
            UnitState {
                scale: e,
                stretch_x: 1.0 + wobble,
                stretch_y: 1.0 - wobble,
                opacity: quick_fade(t),
                ..base
            }
        }
        "shakeIn" => UnitState {
            dx: SHAKE_IN_DISTANCE * (PI * SHAKE_IN_HALF_WAVES * t).sin() * rest,
            opacity: quick_fade(t),
            ..base
        },
        "zoomBlur" => UnitState {
            scale: ZOOM_BLUR_START_SCALE + (1.0 - ZOOM_BLUR_START_SCALE) * e,
            blur: BLUR_START * rest,
            opacity: e,
            ..base
        },
        "glitchIn" => {
            let step = step_of(t.min(1.0 - f64::EPSILON), GLITCH_IN_STEPS);
            let shown = t >= 1.0 || (t > 0.0 && hash01(step, 3) >= GLITCH_IN_DROPOUT);
            UnitState {
                dx: GLITCH_JITTER * jitter(step, 1) * rest,
                dy: GLITCH_JITTER * 0.3 * jitter(step, 2) * rest,
                split: GLITCH_SPLIT * rest,
                opacity: if shown { 1.0 } else { 0.0 },
                ..base
            }
        }
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
        "heartbeat" => {
            let beat = bump(phase, 0.0, 0.15) + HEARTBEAT_SECOND_BEAT * bump(phase, 0.2, 0.35);
            UnitState { scale: 1.0 + HEARTBEAT_SCALE * beat, ..base }
        }
        "jelly" => UnitState {
            stretch_x: 1.0 + JELLY_STRETCH * wave,
            stretch_y: 1.0 - JELLY_STRETCH * wave,
            ..base
        },
        "spin" => UnitState { rotate: 360.0 * phase.rem_euclid(1.0), ..base },
        "shake" => UnitState { dx: SHAKE_DISTANCE * (TAU * SHAKE_CYCLES * phase).sin(), ..base },
        "flicker" => {
            let step = step_of(phase, FLICKER_STEPS);
            let dim = hash01(step, 4) < FLICKER_DIM_CHANCE;
            UnitState { opacity: if dim { FLICKER_DIM_OPACITY } else { 1.0 }, ..base }
        }
        "glitch" => {
            let step = step_of(phase, GLITCH_LOOP_STEPS);
            let phase = phase.rem_euclid(1.0);
            if GLITCH_LOOP_BURSTS.iter().any(|&(start, end)| (start..end).contains(&phase)) {
                UnitState {
                    dx: GLITCH_JITTER * 0.5 * jitter(step, 6),
                    split: GLITCH_SPLIT * (0.5 + 0.5 * hash01(step, 7)),
                    ..base
                }
            } else {
                base
            }
        }
        _ => return None,
    };
    Some(state)
}
