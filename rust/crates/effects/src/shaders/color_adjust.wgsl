struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

// Values arrive normalized from TypeScript (apps/web/src/effects/definitions/adjust.ts):
// sliders become [-1, 1] or [0, 1], hues become [0, 1] turns.
// params[0]: temperature, tint, exposure, contrast
// params[1]: highlights, shadows, whites, blacks
// params[2]: brightness, saturation, vibrance, fade
// params[3]: sharpen, amount, grain, grain_size
// params[4]: shadow_hue, shadow_amount, midtone_hue, midtone_amount
// params[5]: highlight_hue, highlight_amount, vignette, vignette_midpoint
// params[6]: vignette_roundness, vignette_feather, unused, unused
struct EffectUniforms {
    resolution: vec2f,
    direction: vec2f,
    scalars: vec4f,
    params: array<vec4f, 7>,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;

const LUMA = vec3f(0.2126, 0.7152, 0.0722);

fn luma(color: vec3f) -> f32 {
    return dot(color, LUMA);
}

fn hash(point: vec2f) -> f32 {
    return fract(sin(dot(point, vec2f(12.9898, 78.233))) * 43758.5453);
}

fn hue_to_rgb(hue: f32) -> vec3f {
    let k = vec3f(0.0, 2.0 / 3.0, 1.0 / 3.0);
    return clamp(abs(fract(vec3f(hue) + k) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));
}

// Offsets a tonal range toward a hue while keeping its luminance (Lumetri color wheels).
fn tint_range(color: vec3f, hue: f32, amount: f32, weight: f32) -> vec3f {
    let target_color = hue_to_rgb(hue);
    let offset = target_color - luma(target_color);
    return color + offset * amount * weight * 0.5;
}

fn value_noise(point: vec2f) -> f32 {
    let cell = floor(point);
    let local = fract(point);
    let smooth_local = local * local * (3.0 - 2.0 * local);
    let a = hash(cell);
    let b = hash(cell + vec2f(1.0, 0.0));
    let c = hash(cell + vec2f(0.0, 1.0));
    let d = hash(cell + vec2f(1.0, 1.0));
    return mix(mix(a, b, smooth_local.x), mix(c, d, smooth_local.x), smooth_local.y);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let uv = input.tex_coord;
    let texel = vec2f(1.0, 1.0) / uniforms.resolution;
    let source = textureSample(input_texture, input_sampler, uv);
    let neighbors =
        textureSample(input_texture, input_sampler, uv + vec2f(texel.x, 0.0)).rgb +
        textureSample(input_texture, input_sampler, uv - vec2f(texel.x, 0.0)).rgb +
        textureSample(input_texture, input_sampler, uv + vec2f(0.0, texel.y)).rgb +
        textureSample(input_texture, input_sampler, uv - vec2f(0.0, texel.y)).rgb;

    let p0 = uniforms.params[0];
    let p1 = uniforms.params[1];
    let p2 = uniforms.params[2];
    let p3 = uniforms.params[3];
    let p4 = uniforms.params[4];
    let p5 = uniforms.params[5];
    let p6 = uniforms.params[6];

    var color = source.rgb;

    // Detail
    color = color + (color * 4.0 - neighbors) * p3.x * 1.5;

    // White balance
    color = color * vec3f(1.0 + p0.x * 0.3, 1.0 - p0.y * 0.15, 1.0 - p0.x * 0.3);
    color = color + vec3f(p0.y * 0.05, 0.0, p0.y * 0.05);

    // Tone
    color = color * exp2(p0.z * 2.0);
    color = color + p2.x * 0.3;
    color = (color - 0.5) * (1.0 + p0.w * select(1.0, 0.9, p0.w < 0.0)) + 0.5;

    let tone = clamp(luma(color), 0.0, 1.0);
    let shadow_weight = 1.0 - smoothstep(0.0, 0.5, tone);
    let highlight_weight = smoothstep(0.5, 1.0, tone);
    let midtone_weight = 1.0 - shadow_weight - highlight_weight;
    color = color + p1.x * 0.35 * highlight_weight;
    color = color + p1.y * 0.35 * shadow_weight;
    color = color + p1.z * 0.25 * smoothstep(0.6, 1.0, tone);
    color = color + p1.w * 0.25 * (1.0 - smoothstep(0.0, 0.4, tone));

    // Color wheels
    color = tint_range(color, p4.x, p4.y, shadow_weight);
    color = tint_range(color, p4.z, p4.w, midtone_weight);
    color = tint_range(color, p5.x, p5.y, highlight_weight);

    // Saturation and vibrance (vibrance protects already-saturated colors)
    let gray = vec3f(luma(color));
    color = mix(gray, color, 1.0 + p2.y);
    let current_saturation = max(max(color.r, color.g), color.b) - min(min(color.r, color.g), color.b);
    color = mix(vec3f(luma(color)), color, 1.0 + p2.z * (1.0 - clamp(current_saturation, 0.0, 1.0)));

    // Faded film lifts blacks and rolls off whites
    color = mix(color, color * 0.85 + 0.12, p2.w);

    // Vignette
    let aspect = uniforms.resolution.x / uniforms.resolution.y;
    let centered = (uv - 0.5) * 2.0;
    let roundness = p6.x;
    let shaped = vec2f(centered.x * mix(1.0, aspect, max(roundness, 0.0)), centered.y);
    let distance_power = mix(2.0, 6.0, max(-roundness, 0.0));
    let distance_from_center = pow(
        pow(abs(shaped.x), distance_power) + pow(abs(shaped.y), distance_power),
        1.0 / distance_power,
    ) / 1.4142;
    let inner = mix(0.0, 0.9, p5.w);
    let feather = max(p6.y, 0.02);
    let falloff = smoothstep(inner, inner + feather, distance_from_center);
    let vignette = p5.z;
    color = select(
        mix(color, vec3f(1.0), -vignette * falloff),
        color * (1.0 - vignette * falloff),
        vignette >= 0.0,
    );

    // Grain
    let grain_scale = mix(1.0, 0.15, p3.w);
    let noise = value_noise(uv * uniforms.resolution * grain_scale) - 0.5;
    color = color + noise * p3.z * 0.35 * (1.0 - abs(luma(color) - 0.5));

    color = clamp(color, vec3f(0.0), vec3f(1.0));
    return vec4f(mix(source.rgb, color, p3.y), source.a);
}
