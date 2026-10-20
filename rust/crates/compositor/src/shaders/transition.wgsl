struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

struct TransitionUniforms {
    kind: u32,
    progress: f32,
    _pad0: f32,
    _pad1: f32,
}

@group(0) @binding(0) var from_texture: texture_2d<f32>;
@group(0) @binding(1) var from_sampler: sampler;
@group(1) @binding(0) var to_texture: texture_2d<f32>;
@group(1) @binding(1) var to_sampler: sampler;
@group(2) @binding(0) var<uniform> uniforms: TransitionUniforms;

// Layers carry straight alpha; mix in premultiplied space so transparent
// edges don't bleed black into the result.
fn premultiply(color: vec4f) -> vec4f {
    return vec4f(color.rgb * color.a, color.a);
}

fn unpremultiply(color: vec4f) -> vec4f {
    if (color.a <= 0.0) {
        return vec4f(0.0);
    }
    return vec4f(color.rgb / color.a, color.a);
}

// Fades out to an opaque color over the first half, then in from it.
fn dip(from_color: vec4f, to_color: vec4f, dip_color: vec4f, progress: f32) -> vec4f {
    if (progress < 0.5) {
        return mix(from_color, dip_color, progress * 2.0);
    }
    return mix(dip_color, to_color, progress * 2.0 - 1.0);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let from_color = premultiply(textureSample(from_texture, from_sampler, input.tex_coord));
    let to_color = premultiply(textureSample(to_texture, to_sampler, input.tex_coord));
    let progress = clamp(uniforms.progress, 0.0, 1.0);

    var result: vec4f;
    switch uniforms.kind {
        case 1u { result = dip(from_color, to_color, vec4f(0.0, 0.0, 0.0, 1.0), progress); }
        case 2u { result = dip(from_color, to_color, vec4f(1.0, 1.0, 1.0, 1.0), progress); }
        default { result = mix(from_color, to_color, progress); }
    }
    return unpremultiply(result);
}
