use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::BlendMode;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameDescriptor {
    pub width: u32,
    pub height: u32,
    pub clear: CanvasClearDescriptor,
    pub items: Vec<FrameItemDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasClearDescriptor {
    pub color: [f32; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
// rename_all only renames the variant tags; fields of struct variants need rename_all_fields
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum FrameItemDescriptor {
    Layer(LayerDescriptor),
    SceneEffect {
        effect_pass_groups: Vec<Vec<EffectPassDescriptor>>,
    },
    /// Composites `from_items` and `to_items` onto separate transparent canvases,
    /// mixes them with the transition shader, then blends the result over the scene.
    Transition {
        kind: TransitionKind,
        progress: f32,
        from_items: Vec<FrameItemDescriptor>,
        to_items: Vec<FrameItemDescriptor>,
    },
}

/// Mirrors `TRANSITION_TYPES` in apps/web/src/transitions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TransitionKind {
    Dissolve,
    FadeBlack,
    FadeWhite,
}

impl TransitionKind {
    pub fn shader_code(self) -> u32 {
        match self {
            Self::Dissolve => 0,
            Self::FadeBlack => 1,
            Self::FadeWhite => 2,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerDescriptor {
    pub texture_id: String,
    pub transform: QuadTransformDescriptor,
    pub opacity: f32,
    pub blend_mode: BlendMode,
    #[serde(default)]
    pub effect_pass_groups: Vec<Vec<EffectPassDescriptor>>,
    pub mask: Option<LayerMaskDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadTransformDescriptor {
    pub center_x: f32,
    pub center_y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation_degrees: f32,
    pub flip_x: bool,
    pub flip_y: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerMaskDescriptor {
    pub texture_id: String,
    pub feather: f32,
    pub inverted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectPassDescriptor {
    pub shader: String,
    pub uniforms: HashMap<String, EffectUniformValueDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum EffectUniformValueDescriptor {
    Number(f32),
    Vector(Vec<f32>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasTextureDescriptor {
    pub id: String,
    pub width: u32,
    pub height: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_effect_reads_camel_case_fields_sent_by_typescript() {
        let item: FrameItemDescriptor = serde_json::from_str(
            r#"{"type":"sceneEffect","effectPassGroups":[[{"shader":"color-adjust","uniforms":{"u_params":[0.5]}}]]}"#,
        )
        .unwrap();
        let FrameItemDescriptor::SceneEffect { effect_pass_groups } = item else {
            panic!("expected a scene effect");
        };
        assert_eq!(effect_pass_groups[0][0].shader, "color-adjust");
    }

    #[test]
    fn transition_reads_nested_items_sent_by_typescript() {
        let item: FrameItemDescriptor = serde_json::from_str(
            r#"{"type":"transition","kind":"fadeBlack","progress":0.25,"fromItems":[{"type":"sceneEffect","effectPassGroups":[]}],"toItems":[]}"#,
        )
        .unwrap();
        let FrameItemDescriptor::Transition {
            kind,
            progress,
            from_items,
            to_items,
        } = item
        else {
            panic!("expected a transition");
        };
        assert_eq!(kind, TransitionKind::FadeBlack);
        assert_eq!(progress, 0.25);
        assert_eq!(from_items.len(), 1);
        assert!(to_items.is_empty());
    }
}
