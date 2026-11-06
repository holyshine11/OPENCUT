//! 텍스트 클립의 인/아웃/반복 애니메이션. 시간은 모두 초 단위이고, 틱 변환은 호출하는 쪽이 한다.
//! 저장된 값은 검증하지 않고 들어오므로 여기서 걸러 낸다: 모르는 프리셋이나 유한한 양수가 아닌
//! 길이/주기는 그 슬롯이 없는 것으로 본다.

mod presets;

use bridge::export;
use serde::de::IgnoredAny;
use serde::{Deserialize, Deserializer, Serialize};

pub use presets::{LOOP_PRESETS, REVEAL_PRESETS, sample_loop, sample_reveal};

#[export]
pub const TEXT_ANIMATION_DEFAULT_DURATION: f64 = 0.5;
#[export]
pub const TEXT_ANIMATION_MIN_DURATION: f64 = 0.1;
#[export]
pub const TEXT_ANIMATION_DEFAULT_LOOP_PERIOD: f64 = 1.0;
/// 반복 주기 슬라이더 범위(초)
#[export]
pub const TEXT_ANIMATION_MIN_LOOP_PERIOD: f64 = 0.2;
#[export]
pub const TEXT_ANIMATION_MAX_LOOP_PERIOD: f64 = 4.0;

/// 한 유닛(지금은 텍스트 전체)에 덧씌울 변화. dx/dy는 텍스트 박스 너비/높이 비율,
/// rotate는 도, blur는 텍스트 높이 비율
#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "wasm", tsify(into_wasm_abi))]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct UnitState {
    pub dx: f64,
    pub dy: f64,
    pub scale: f64,
    pub rotate: f64,
    pub opacity: f64,
    pub blur: f64,
}

impl UnitState {
    pub const IDENTITY: Self = Self {
        dx: 0.0,
        dy: 0.0,
        scale: 1.0,
        rotate: 0.0,
        opacity: 1.0,
        blur: 0.0,
    };

    fn is_finite(&self) -> bool {
        [self.dx, self.dy, self.scale, self.rotate, self.opacity, self.blur]
            .iter()
            .all(|value| value.is_finite())
    }

    /// 두 변화를 겹친다. 이동/회전/블러는 더하고 크기/투명도는 곱한다
    pub fn compose(self, other: Self) -> Self {
        Self {
            dx: self.dx + other.dx,
            dy: self.dy + other.dy,
            scale: self.scale * other.scale,
            rotate: self.rotate + other.rotate,
            opacity: self.opacity * other.opacity,
            blur: self.blur + other.blur,
        }
    }
}

#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TextRevealSlot {
    #[serde(rename = "type")]
    pub kind: String,
    /// 초
    pub duration: f64,
}

#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TextLoopSlot {
    #[serde(rename = "type")]
    pub kind: String,
    /// 한 바퀴 초
    pub period: f64,
    /// 반복이 이미 진행된 초. 분할한 오른쪽 조각이 이어서 돌도록 분할 지점까지 지난 시간을 담는다
    #[serde(default, skip_serializing_if = "is_zero")]
    pub offset: f64,
}

fn is_zero(value: &f64) -> bool {
    *value == 0.0
}

/// 저장된 값이 모양부터 틀려도(필드 누락, 문자열 숫자 등) 실패하지 않고 그 값만 없는 것으로 읽는다.
/// 슬롯 하나가 깨졌다고 나머지 슬롯이나 렌더 전체가 멈추면 안 된다
fn lenient<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Lenient<T> {
        Valid(T),
        Invalid(IgnoredAny),
    }
    Ok(match Option::<Lenient<T>>::deserialize(deserializer)? {
        Some(Lenient::Valid(value)) => Some(value),
        _ => None,
    })
}

fn lenient_or_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(lenient(deserializer)?.unwrap_or_default())
}

/// `TextElement.textAnimation`과 같은 모양
#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct TextAnimation {
    #[serde(default, deserialize_with = "lenient")]
    pub r#in: Option<TextRevealSlot>,
    #[serde(default, deserialize_with = "lenient")]
    pub out: Option<TextRevealSlot>,
    #[serde(default, deserialize_with = "lenient")]
    pub r#loop: Option<TextLoopSlot>,
}

fn is_positive(value: f64) -> bool {
    value.is_finite() && value > 0.0
}

fn valid_reveal(slot: &Option<TextRevealSlot>) -> Option<&TextRevealSlot> {
    slot.as_ref()
        .filter(|slot| is_positive(slot.duration) && REVEAL_PRESETS.contains(&slot.kind.as_str()))
}

fn valid_loop(slot: &Option<TextLoopSlot>) -> Option<&TextLoopSlot> {
    slot.as_ref()
        .filter(|slot| is_positive(slot.period) && LOOP_PRESETS.contains(&slot.kind.as_str()))
}

/// 렌더에 실제로 쓰는 인/아웃 길이(초)
#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "wasm", tsify(into_wasm_abi))]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveDurations {
    pub in_seconds: f64,
    pub out_seconds: f64,
}

/// 저장된 길이는 그대로 두고, 인 + 아웃이 클립보다 길면 비율대로 줄인다
fn effective_durations(animation: &TextAnimation, clip_seconds: f64) -> EffectiveDurations {
    let clip = if is_positive(clip_seconds) { clip_seconds } else { 0.0 };
    let in_seconds = valid_reveal(&animation.r#in).map_or(0.0, |slot| slot.duration);
    let out_seconds = valid_reveal(&animation.out).map_or(0.0, |slot| slot.duration);
    // 아주 큰 저장값끼리 더하면 무한대가 되므로 큰 쪽으로 나눈 비율로 비교한다
    let largest = in_seconds.max(out_seconds);
    if largest <= 0.0 {
        return EffectiveDurations { in_seconds: 0.0, out_seconds: 0.0 };
    }
    let (in_share, out_share) = (in_seconds / largest, out_seconds / largest);
    if in_share + out_share <= clip / largest {
        return EffectiveDurations { in_seconds, out_seconds };
    }
    let shares = in_share + out_share;
    EffectiveDurations {
        in_seconds: clip * in_share / shares,
        out_seconds: clip * out_share / shares,
    }
}

#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "wasm", tsify(from_wasm_abi))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextAnimationEffectiveDurationsOptions {
    #[serde(default, deserialize_with = "lenient_or_default")]
    pub animation: TextAnimation,
    pub clip_seconds: f64,
}

#[export]
pub fn text_animation_effective_durations(
    TextAnimationEffectiveDurationsOptions { animation, clip_seconds }: TextAnimationEffectiveDurationsOptions,
) -> EffectiveDurations {
    effective_durations(&animation, clip_seconds)
}

#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "wasm", tsify(from_wasm_abi))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveTextAnimationOptions {
    #[serde(default, deserialize_with = "lenient_or_default")]
    pub animation: TextAnimation,
    /// 클립 시작부터 지난 초
    pub local_seconds: f64,
    pub clip_seconds: f64,
}

/// 한 시점에 텍스트 전체에 덧씌울 변화. 인/아웃 구간과 반복이 겹치면 둘 다 적용한다
#[export]
pub fn resolve_text_animation(
    ResolveTextAnimationOptions { animation, local_seconds, clip_seconds }: ResolveTextAnimationOptions,
) -> UnitState {
    if !is_positive(clip_seconds) || !local_seconds.is_finite() {
        return UnitState::IDENTITY;
    }
    let local = local_seconds.clamp(0.0, clip_seconds);
    let durations = effective_durations(&animation, clip_seconds);
    let mut state = UnitState::IDENTITY;

    if let Some(slot) = valid_reveal(&animation.r#in)
        && durations.in_seconds > 0.0 && local < durations.in_seconds
            && let Some(sample) = sample_reveal(&slot.kind, local / durations.in_seconds) {
                state = state.compose(sample);
            }
    if let Some(slot) = valid_reveal(&animation.out) {
        let out_start = clip_seconds - durations.out_seconds;
        if durations.out_seconds > 0.0 && local > out_start {
            let progress = (local - out_start) / durations.out_seconds;
            if let Some(sample) = sample_reveal(&slot.kind, 1.0 - progress) {
                state = state.compose(sample);
            }
        }
    }
    if let Some(slot) = valid_loop(&animation.r#loop) {
        // local / period를 먼저 하면 아주 작은 주기에서 무한대가 되어 NaN이 나온다
        let offset = if slot.offset.is_finite() { slot.offset.max(0.0) } else { 0.0 };
        let phase = ((local % slot.period + offset % slot.period) % slot.period) / slot.period;
        if let Some(sample) = sample_loop(&slot.kind, phase) {
            state = state.compose(sample);
        }
    }
    if state.is_finite() { state } else { UnitState::IDENTITY }
}

#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "wasm", tsify(from_wasm_abi))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextAnimationSliderRangeOptions {
    pub clip_seconds: f64,
    /// 반대쪽 슬롯의 유효 길이
    pub other_seconds: f64,
    /// 이 슬롯의 유효 길이
    pub current_seconds: f64,
}

#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "wasm", tsify(into_wasm_abi))]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct SliderRange {
    pub min: f64,
    pub max: f64,
    pub enabled: bool,
}

/// 인/아웃 길이 슬라이더 범위. 최대를 먼저 구하고 최소가 최대를 넘지 않게 한다
#[export]
pub fn text_animation_slider_range(
    TextAnimationSliderRangeOptions { clip_seconds, other_seconds, current_seconds }: TextAnimationSliderRangeOptions,
) -> SliderRange {
    let clip = if is_positive(clip_seconds) { clip_seconds } else { 0.0 };
    let other = if other_seconds.is_finite() { other_seconds.max(0.0) } else { 0.0 };
    let current = if current_seconds.is_finite() { current_seconds.max(0.0) } else { 0.0 };
    // 유효 길이끼리는 합이 클립 이하라 current ≤ clip - other이지만, 부동소수점 오차로 어긋나지 않게 묶는다
    let max = (clip - other).max(current).min(clip).max(0.0);
    let min = TEXT_ANIMATION_MIN_DURATION.min(max).min(current);
    SliderRange { min, max, enabled: max > 0.0 && min < max }
}

#[cfg_attr(feature = "wasm", derive(tsify_next::Tsify))]
#[cfg_attr(feature = "wasm", tsify(into_wasm_abi))]
#[derive(Serialize, Clone, Debug)]
pub struct TextAnimationPresets {
    pub reveal: Vec<String>,
    pub r#loop: Vec<String>,
}

#[export]
pub fn text_animation_presets() -> TextAnimationPresets {
    TextAnimationPresets {
        reveal: REVEAL_PRESETS.iter().map(|id| id.to_string()).collect(),
        r#loop: LOOP_PRESETS.iter().map(|id| id.to_string()).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reveal(kind: &str, duration: f64) -> Option<TextRevealSlot> {
        Some(TextRevealSlot { kind: kind.into(), duration })
    }

    fn resolve(animation: &TextAnimation, local: f64, clip: f64) -> UnitState {
        resolve_text_animation(ResolveTextAnimationOptions {
            animation: animation.clone(),
            local_seconds: local,
            clip_seconds: clip,
        })
    }

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn every_reveal_preset_starts_hidden_or_moved_and_ends_at_identity() {
        for id in REVEAL_PRESETS {
            assert_eq!(sample_reveal(id, 1.0), Some(UnitState::IDENTITY), "{id} end");
            assert_ne!(sample_reveal(id, 0.0), Some(UnitState::IDENTITY), "{id} start");
        }
    }

    #[test]
    fn every_loop_preset_returns_to_its_start_after_one_period() {
        for id in LOOP_PRESETS {
            let start = sample_loop(id, 0.0).unwrap();
            let next = sample_loop(id, 1.0).unwrap();
            assert!(close(start.dx, next.dx) && close(start.dy, next.dy), "{id}");
            assert!(close(start.scale, next.scale) && close(start.rotate, next.rotate), "{id}");
            assert!(close(start.opacity, next.opacity), "{id}");
        }
    }

    #[test]
    fn in_animation_runs_only_inside_its_window() {
        let animation = TextAnimation { r#in: reveal("fade", 0.5), ..Default::default() };
        assert!(close(resolve(&animation, 0.0, 3.0).opacity, 0.0));
        assert!(resolve(&animation, 0.25, 3.0).opacity > 0.0);
        assert_eq!(resolve(&animation, 0.5, 3.0), UnitState::IDENTITY);
        assert_eq!(resolve(&animation, 2.0, 3.0), UnitState::IDENTITY);
    }

    #[test]
    fn out_animation_ends_hidden_at_clip_end() {
        let animation = TextAnimation { out: reveal("fade", 0.5), ..Default::default() };
        assert_eq!(resolve(&animation, 2.5, 3.0), UnitState::IDENTITY);
        assert!(close(resolve(&animation, 3.0, 3.0).opacity, 0.0));
    }

    #[test]
    fn in_and_out_longer_than_clip_shrink_proportionally() {
        let animation = TextAnimation {
            r#in: reveal("fade", 1.0),
            out: reveal("fade", 3.0),
            ..Default::default()
        };
        let durations = effective_durations(&animation, 2.0);
        assert!(close(durations.in_seconds, 0.5));
        assert!(close(durations.out_seconds, 1.5));
        // 줄어든 경계에서 인은 끝나고 아웃은 아직 시작 전
        assert_eq!(resolve(&animation, 0.5, 2.0), UnitState::IDENTITY);
    }

    #[test]
    fn loop_combines_with_in() {
        let animation = TextAnimation {
            r#in: reveal("fade", 0.5),
            r#loop: Some(TextLoopSlot { kind: "pulse".into(), period: 1.0, offset: 0.0 }),
            ..Default::default()
        };
        let state = resolve(&animation, 0.25, 3.0);
        assert!(state.opacity > 0.0 && state.opacity < 1.0);
        assert!(!close(state.scale, 1.0));
    }

    #[test]
    fn loop_phase_repeats_each_period() {
        let animation = TextAnimation {
            r#loop: Some(TextLoopSlot { kind: "wiggle".into(), period: 0.8, offset: 0.0 }),
            ..Default::default()
        };
        let a = resolve(&animation, 0.3, 5.0);
        let b = resolve(&animation, 0.3 + 0.8 * 3.0, 5.0);
        assert!(close(a.rotate, b.rotate));
    }

    #[test]
    fn loop_offset_continues_the_phase() {
        let looped = |offset: f64| TextAnimation {
            r#loop: Some(TextLoopSlot { kind: "blink".into(), period: 1.0, offset }),
            ..Default::default()
        };
        let whole = resolve(&looped(0.0), 0.5, 3.0);
        let right_piece_start = resolve(&looped(0.5), 0.0, 2.5);
        assert!(close(whole.opacity, right_piece_start.opacity));
        // 오프셋이 깨진 값이면 0으로 본다
        assert_eq!(resolve(&looped(f64::NAN), 0.3, 3.0), resolve(&looped(0.0), 0.3, 3.0));
    }

    #[test]
    fn invalid_stored_values_disable_only_that_slot() {
        let animation = TextAnimation {
            r#in: reveal("noSuchPreset", 0.5),
            out: reveal("fade", f64::NAN),
            r#loop: Some(TextLoopSlot { kind: "wiggle".into(), period: 0.0, offset: 0.0 }),
        };
        for local in [0.0, 0.1, 1.5, 2.9, 3.0] {
            let state = resolve(&animation, local, 3.0);
            assert_eq!(state, UnitState::IDENTITY, "local {local}");
        }
        let durations = effective_durations(&animation, 3.0);
        assert_eq!(durations, EffectiveDurations { in_seconds: 0.0, out_seconds: 0.0 });
    }

    #[test]
    fn malformed_slot_is_dropped_without_breaking_valid_ones() {
        let options: ResolveTextAnimationOptions = serde_json::from_str(
            r#"{"animation":{"in":{"type":"fade"},"out":{"type":"fade","duration":"bad"},
                "loop":{"type":"pulse","period":1}},"localSeconds":0.25,"clipSeconds":3}"#,
        )
        .unwrap();
        assert_eq!(options.animation.r#in, None);
        assert_eq!(options.animation.out, None);
        assert!(options.animation.r#loop.is_some());
        let state = resolve_text_animation(options);
        assert!(!close(state.scale, 1.0));
    }

    #[test]
    fn malformed_animation_reads_as_empty() {
        for raw in [r#""oops""#, "null", "42"] {
            let json = format!(r#"{{"animation":{raw},"localSeconds":0,"clipSeconds":3}}"#);
            let options: ResolveTextAnimationOptions = serde_json::from_str(&json).unwrap();
            assert_eq!(resolve_text_animation(options), UnitState::IDENTITY, "{raw}");
        }
    }

    #[test]
    fn tiny_loop_period_stays_finite() {
        for kind in LOOP_PRESETS {
            let animation = TextAnimation {
                r#loop: Some(TextLoopSlot { kind: (*kind).into(), period: 1e-320, offset: 0.0 }),
                ..Default::default()
            };
            assert!(resolve(&animation, 0.25, 3.0).is_finite(), "{kind}");
        }
    }

    #[test]
    fn huge_durations_stay_finite() {
        let animation = TextAnimation {
            r#in: reveal("fade", f64::MAX),
            out: reveal("fade", f64::MAX),
            ..Default::default()
        };
        let durations = effective_durations(&animation, 3.0);
        assert!(close(durations.in_seconds, 1.5) && close(durations.out_seconds, 1.5));
        assert!(close(resolve(&animation, 0.0, 3.0).opacity, 0.0));
        for local in [0.0, 1.5, 3.0] {
            assert!(resolve(&animation, local, 3.0).is_finite());
        }
    }

    #[test]
    fn non_positive_clip_is_identity() {
        let animation = TextAnimation { r#in: reveal("fade", 0.5), ..Default::default() };
        assert_eq!(resolve(&animation, 0.0, 0.0), UnitState::IDENTITY);
        assert_eq!(resolve(&animation, f64::NAN, 3.0), UnitState::IDENTITY);
    }

    fn range(clip: f64, other: f64, current: f64) -> SliderRange {
        text_animation_slider_range(TextAnimationSliderRangeOptions {
            clip_seconds: clip,
            other_seconds: other,
            current_seconds: current,
        })
    }

    #[test]
    fn slider_max_leaves_room_for_the_other_slot() {
        let r = range(3.0, 0.5, 0.5);
        assert!(close(r.max, 2.5));
        assert!(close(r.min, TEXT_ANIMATION_MIN_DURATION));
        assert!(r.enabled);
    }

    #[test]
    fn slider_min_never_exceeds_max_after_asymmetric_trim() {
        // 인:아웃 저장값 1:9인 클립을 최소 길이의 2배보다 짧게 줄인 경우
        let clip = TEXT_ANIMATION_MIN_DURATION;
        let animation = TextAnimation {
            r#in: reveal("fade", 0.1),
            out: reveal("fade", 0.9),
            ..Default::default()
        };
        let d = effective_durations(&animation, clip);
        let in_range = range(clip, d.out_seconds, d.in_seconds);
        let out_range = range(clip, d.in_seconds, d.out_seconds);
        for r in [in_range, out_range] {
            assert!(r.min <= r.max, "{r:?}");
        }
        assert!(in_range.min <= d.in_seconds && d.in_seconds <= in_range.max);
    }

    #[test]
    fn slider_is_disabled_when_no_room_is_left() {
        let r = range(1.0, 1.0, 0.0);
        assert!(!r.enabled);
        assert!(close(r.max, 0.0));
    }
}
