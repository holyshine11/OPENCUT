//! 글자, 단어, 줄 단위로 시차를 두고 움직이는 프리셋.
//! 웹은 클립 전체를 그리는 단위(보통 글자)로 쪼개고, 각 단위가 몇 번째 단어/줄에 속하는지 넘긴다.
//! 결과의 dx/dy는 줄 높이 비율이고 scale/rotate의 중심은 그 단위의 가운데다.
//! 그래서 단어/줄 프리셋은 중심이 어긋나지 않도록 이동과 투명도만 쓴다.

use std::f64::consts::{PI, TAU};

use crate::UnitState;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum UnitKind {
    Grapheme,
    Word,
    Line,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum UnitOrder {
    Forward,
    Random,
}

pub struct UnitRevealPreset {
    pub id: &'static str,
    pub kind: UnitKind,
    /// 이웃한 두 단위의 시작 간격을 한 단위 길이에 대한 비율로. 1이면 겹치지 않고, 작을수록 겹친다
    pub stagger: f64,
    pub order: UnitOrder,
}

const fn reveal(id: &'static str, kind: UnitKind, stagger: f64, order: UnitOrder) -> UnitRevealPreset {
    UnitRevealPreset { id, kind, stagger, order }
}

/// 인/아웃 유닛 프리셋. 아웃은 진행도를 거꾸로 넣으므로 뒤쪽 단위부터 사라진다
pub const UNIT_REVEAL_PRESETS: &[UnitRevealPreset] = &[
    reveal("typewriter", UnitKind::Grapheme, 1.0, UnitOrder::Forward),
    reveal("letterFade", UnitKind::Grapheme, 0.3, UnitOrder::Forward),
    reveal("letterPop", UnitKind::Grapheme, 0.4, UnitOrder::Forward),
    reveal("waveIn", UnitKind::Grapheme, 0.3, UnitOrder::Forward),
    reveal("randomAppear", UnitKind::Grapheme, 0.5, UnitOrder::Random),
    reveal("scatter", UnitKind::Grapheme, 0.2, UnitOrder::Random),
    reveal("letterDrop", UnitKind::Grapheme, 0.3, UnitOrder::Forward),
    reveal("letterSpin", UnitKind::Grapheme, 0.3, UnitOrder::Forward),
    reveal("letterZoom", UnitKind::Grapheme, 0.3, UnitOrder::Forward),
    reveal("letterFlip", UnitKind::Grapheme, 0.35, UnitOrder::Forward),
    reveal("wordByWord", UnitKind::Word, 0.6, UnitOrder::Forward),
    reveal("wordSlide", UnitKind::Word, 0.5, UnitOrder::Forward),
    reveal("lineRise", UnitKind::Line, 0.6, UnitOrder::Forward),
];

/// 반복 유닛 프리셋. 모두 글자 단위다
pub const UNIT_LOOP_PRESETS: &[&str] = &["letterWave", "letterJump", "letterShake", "letterPulse", "letterSwing"];

const WAVE_IN_DISTANCE: f64 = 0.5;
const WORD_RISE_DISTANCE: f64 = 0.3;
const LINE_RISE_DISTANCE: f64 = 0.6;
const SCATTER_DISTANCE: f64 = 1.5;
const SCATTER_DEGREES: f64 = 120.0;
const LETTER_WAVE_HEIGHT: f64 = 0.15;
/// 글자 하나마다 물결 위상이 이만큼 늦는다(한 바퀴 비율)
const LETTER_WAVE_SPACING: f64 = 0.08;
const LETTER_JUMP_HEIGHT: f64 = 0.3;
const LETTER_DROP_HEIGHT: f64 = 0.8;
const LETTER_SPIN_DEGREES: f64 = -180.0;
const LETTER_ZOOM_START_SCALE: f64 = 2.5;
const WORD_SLIDE_DISTANCE: f64 = 0.6;
const LETTER_SHAKE_DISTANCE: f64 = 0.04;
/// 글자 떨림이 한 주기에 가로/세로로 떨리는 횟수. 서로 달라야 원을 그리지 않는다
const LETTER_SHAKE_CYCLES_X: f64 = 5.0;
const LETTER_SHAKE_CYCLES_Y: f64 = 7.0;
const LETTER_PULSE_SCALE: f64 = 0.25;
const LETTER_SWING_DEGREES: f64 = 15.0;

pub fn unit_reveal_preset(id: &str) -> Option<&'static UnitRevealPreset> {
    UNIT_REVEAL_PRESETS.iter().find(|preset| preset.id == id)
}

pub fn is_unit_loop(id: &str) -> bool {
    UNIT_LOOP_PRESETS.contains(&id)
}

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

/// 0~1 사이의 고정된 난수. 같은 클립은 매 프레임, 내보내기에서도 같은 순서가 나와야 한다
pub(crate) fn hash01(value: u32, salt: u32) -> f64 {
    let mut x = value.wrapping_mul(0x9E37_79B9) ^ salt.wrapping_mul(0x85EB_CA6B);
    x ^= x >> 16;
    x = x.wrapping_mul(0x7FEB_352D);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846C_A68B);
    x ^= x >> 16;
    f64::from(x) / f64::from(u32::MAX)
}

/// 그룹 count개를 시차를 두고 한 번에 진행할 때 그룹 rank의 진행도
fn staggered_progress(t: f64, rank: u32, count: u32, stagger: f64) -> f64 {
    let gaps = f64::from(count.saturating_sub(1));
    let length = 1.0 / (1.0 + gaps * stagger);
    let start = f64::from(rank) * stagger * length;
    ((t - start) / length).clamp(0.0, 1.0)
}

/// 무작위 순서에서 group이 몇 번째로 움직이는지
fn random_rank(group: u32, count: u32) -> u32 {
    let key = hash01(group, count);
    (0..count).filter(|&other| hash01(other, count) < key).count() as u32
}

fn sample_unit_reveal(id: &str, t: f64, unit: u32) -> UnitState {
    let e = ease_out_cubic(t);
    let rest = 1.0 - e;
    let base = UnitState::IDENTITY;
    match id {
        "typewriter" => UnitState { opacity: if t > 0.0 { 1.0 } else { 0.0 }, ..base },
        "letterFade" | "randomAppear" => UnitState { opacity: e, ..base },
        "letterPop" => UnitState { scale: ease_out_back(t), opacity: (t * 3.0).min(1.0), ..base },
        "waveIn" => UnitState { dy: WAVE_IN_DISTANCE * rest, opacity: e, ..base },
        "wordByWord" => UnitState { dy: WORD_RISE_DISTANCE * rest, opacity: e, ..base },
        "lineRise" => UnitState { dy: LINE_RISE_DISTANCE * rest, opacity: e, ..base },
        "letterDrop" => UnitState {
            dy: -LETTER_DROP_HEIGHT * (1.0 - ease_out_bounce(t)),
            opacity: (t * 3.0).min(1.0),
            ..base
        },
        "letterSpin" => UnitState { rotate: LETTER_SPIN_DEGREES * rest, scale: e, opacity: e, ..base },
        "letterZoom" => UnitState {
            scale: LETTER_ZOOM_START_SCALE + (1.0 - LETTER_ZOOM_START_SCALE) * e,
            opacity: e,
            ..base
        },
        "letterFlip" => UnitState { stretch_x: e, opacity: (t * 3.0).min(1.0), ..base },
        "wordSlide" => UnitState { dx: WORD_SLIDE_DISTANCE * rest, opacity: e, ..base },
        "scatter" => {
            let angle = TAU * hash01(unit, 1);
            UnitState {
                dx: SCATTER_DISTANCE * rest * angle.cos(),
                dy: SCATTER_DISTANCE * rest * angle.sin(),
                rotate: SCATTER_DEGREES * (hash01(unit, 2) - 0.5) * 2.0 * rest,
                opacity: e,
                ..base
            }
        }
        _ => base,
    }
}

/// 단위들이 속한 단어/줄 번호. 길이가 같아야 하고, 단위 순서는 읽는 순서다
pub struct UnitGroups<'a> {
    pub word_of: &'a [u32],
    pub line_of: &'a [u32],
}

impl UnitGroups<'_> {
    fn len(&self) -> usize {
        self.word_of.len().min(self.line_of.len())
    }

    /// (그룹 번호, 그룹 수)
    fn group(&self, kind: UnitKind, unit: usize) -> (u32, u32) {
        let groups = match kind {
            UnitKind::Grapheme => return (unit as u32, self.len() as u32),
            UnitKind::Word => self.word_of,
            UnitKind::Line => self.line_of,
        };
        let count = groups.iter().take(self.len()).max().map_or(1, |max| max + 1);
        (groups[unit].min(count - 1), count)
    }
}

/// 진행도 t(0 숨음 → 1 원래 모습)에서 단위별 상태
pub fn reveal_states(preset: &UnitRevealPreset, t: f64, groups: &UnitGroups) -> Vec<UnitState> {
    let t = t.clamp(0.0, 1.0);
    (0..groups.len())
        .map(|unit| {
            let (group, count) = groups.group(preset.kind, unit);
            let rank = match preset.order {
                UnitOrder::Forward => group,
                UnitOrder::Random => random_rank(group, count),
            };
            let progress = staggered_progress(t, rank, count, preset.stagger);
            sample_unit_reveal(preset.id, progress, unit as u32)
        })
        .collect()
}

/// phase(0~1) 지점에서 단위별 반복 상태
pub fn loop_states(id: &str, phase: f64, groups: &UnitGroups) -> Vec<UnitState> {
    let count = groups.len();
    (0..count)
        .map(|unit| {
            let base = UnitState::IDENTITY;
            match id {
                "letterWave" => {
                    let wave = (TAU * (phase - unit as f64 * LETTER_WAVE_SPACING)).sin();
                    UnitState { dy: -LETTER_WAVE_HEIGHT * wave, ..base }
                }
                "letterJump" => {
                    // 한 바퀴 동안 글자가 하나씩 차례로 뛰어오른다
                    let slot = phase * count as f64 - unit as f64;
                    if (0.0..1.0).contains(&slot) {
                        UnitState { dy: -LETTER_JUMP_HEIGHT * (PI * slot).sin(), ..base }
                    } else {
                        base
                    }
                }
                "letterShake" => {
                    // 글자마다 다른 위상으로 떨어 한꺼번에 움직이지 않는다
                    let x = TAU * (LETTER_SHAKE_CYCLES_X * phase + hash01(unit as u32, 8));
                    let y = TAU * (LETTER_SHAKE_CYCLES_Y * phase + hash01(unit as u32, 9));
                    UnitState { dx: LETTER_SHAKE_DISTANCE * x.sin(), dy: LETTER_SHAKE_DISTANCE * y.sin(), ..base }
                }
                "letterPulse" => {
                    let wave = (TAU * (phase - unit as f64 * LETTER_WAVE_SPACING)).sin().max(0.0);
                    UnitState { scale: 1.0 + LETTER_PULSE_SCALE * wave, ..base }
                }
                "letterSwing" => {
                    let wave = (TAU * (phase - unit as f64 * LETTER_WAVE_SPACING)).sin();
                    UnitState { rotate: LETTER_SWING_DEGREES * wave, ..base }
                }
                _ => base,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn groups<'a>(word_of: &'a [u32], line_of: &'a [u32]) -> UnitGroups<'a> {
        UnitGroups { word_of, line_of }
    }

    #[test]
    fn every_unit_reveal_starts_hidden_and_ends_identity() {
        let words = [0, 0, 1, 1];
        let lines = [0, 0, 0, 1];
        let g = groups(&words, &lines);
        for preset in UNIT_REVEAL_PRESETS {
            for state in reveal_states(preset, 0.0, &g) {
                assert_eq!(state.opacity, 0.0, "{} start", preset.id);
            }
            for state in reveal_states(preset, 1.0, &g) {
                assert!((state.opacity - 1.0).abs() < 1e-9, "{} end", preset.id);
                assert!(state.dx.abs() < 1e-9 && state.dy.abs() < 1e-9, "{} end pos", preset.id);
                assert!((state.scale - 1.0).abs() < 1e-9 && state.rotate.abs() < 1e-9, "{} end shape", preset.id);
                assert!((state.stretch_x - 1.0).abs() < 1e-9 && (state.stretch_y - 1.0).abs() < 1e-9, "{} end stretch", preset.id);
            }
        }
    }

    #[test]
    fn typewriter_reveals_letters_in_order() {
        let ids = [0; 4];
        let g = groups(&ids, &ids);
        let preset = unit_reveal_preset("typewriter").unwrap();
        let shown = |t: f64| reveal_states(preset, t, &g).iter().filter(|s| s.opacity > 0.0).count();
        assert_eq!(shown(0.1), 1);
        assert_eq!(shown(0.6), 3);
        assert_eq!(shown(1.0), 4);
    }

    #[test]
    fn word_preset_moves_letters_of_a_word_together() {
        let words = [0, 0, 0, 1, 1];
        let lines = [0; 5];
        let states = reveal_states(unit_reveal_preset("wordByWord").unwrap(), 0.4, &groups(&words, &lines));
        assert_eq!(states[0], states[2]);
        assert_eq!(states[3], states[4]);
        assert!(states[0].opacity > states[3].opacity);
    }

    #[test]
    fn random_order_is_a_stable_permutation() {
        let ranks: Vec<u32> = (0..12).map(|group| random_rank(group, 12)).collect();
        let mut sorted = ranks.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..12).collect::<Vec<_>>());
        assert_eq!(ranks, (0..12).map(|group| random_rank(group, 12)).collect::<Vec<_>>());
    }

    #[test]
    fn unit_loops_return_to_start_after_one_period() {
        let ids = [0; 6];
        let g = groups(&ids, &ids);
        for id in UNIT_LOOP_PRESETS {
            let start = loop_states(id, 0.0, &g);
            let end = loop_states(id, 1.0 - 1e-12, &g);
            for (a, b) in start.iter().zip(end.iter()) {
                assert!((a.dx - b.dx).abs() < 1e-6 && (a.dy - b.dy).abs() < 1e-6, "{id}");
                assert!((a.scale - b.scale).abs() < 1e-6 && (a.rotate - b.rotate).abs() < 1e-6, "{id}");
            }
        }
    }

    #[test]
    fn mismatched_group_lengths_do_not_panic() {
        let states = reveal_states(unit_reveal_preset("lineRise").unwrap(), 0.5, &groups(&[0, 1, 2], &[5]));
        assert_eq!(states.len(), 1);
    }
}
