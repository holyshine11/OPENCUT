struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) tex_coord: vec2f,
}

// Values arrive normalized from TypeScript (apps/web/src/effects/definitions/stylize.ts):
// slot 0: mode, slot 1: mix, slots 2..: the effect's own params in declaration order,
// numbers divided by max(|min|, |max|) (so 0~360 degrees become turns), selects as option index.
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
const TAU = 6.28318530718;
const BLUR_SAMPLES = 24;

fn slot(index: u32) -> f32 {
    return uniforms.params[index / 4u][index % 4u];
}

// The effect's own param n (slot n + 2).
fn param(index: u32) -> f32 {
    return slot(index + 2u);
}

// textureSampleLevel keeps sampling legal inside per-pixel branches.
fn sample(uv: vec2f) -> vec4f {
    return textureSampleLevel(input_texture, input_sampler, uv, 0.0);
}

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

fn turn_to_dir(turn: f32) -> vec2f {
    return vec2f(cos(turn * TAU), sin(turn * TAU));
}

fn aspect() -> f32 {
    return uniforms.resolution.x / max(uniforms.resolution.y, 1.0);
}

// Center-relative offset in a square space, so circles stay circles on wide frames.
fn to_square(uv: vec2f) -> vec2f {
    return (uv - 0.5) * vec2f(aspect(), 1.0);
}

fn from_square(point: vec2f) -> vec2f {
    return point / vec2f(aspect(), 1.0) + 0.5;
}

fn sobel(uv: vec2f, texel: vec2f) -> f32 {
    let tl = luma(sample(uv + texel * vec2f(-1.0, -1.0)).rgb);
    let t = luma(sample(uv + texel * vec2f(0.0, -1.0)).rgb);
    let tr = luma(sample(uv + texel * vec2f(1.0, -1.0)).rgb);
    let l = luma(sample(uv + texel * vec2f(-1.0, 0.0)).rgb);
    let r = luma(sample(uv + texel * vec2f(1.0, 0.0)).rgb);
    let bl = luma(sample(uv + texel * vec2f(-1.0, 1.0)).rgb);
    let b = luma(sample(uv + texel * vec2f(0.0, 1.0)).rgb);
    let br = luma(sample(uv + texel * vec2f(1.0, 1.0)).rgb);
    let gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
    let gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    return length(vec2f(gx, gy));
}

fn zoom_blur(uv: vec2f) -> vec4f {
    let center = vec2f(0.5) + vec2f(param(1u), param(2u)) * 0.5;
    let strength = param(0u) * 0.35;
    var sum = vec4f(0.0);
    for (var i = 0; i < BLUR_SAMPLES; i++) {
        let t = f32(i) / f32(BLUR_SAMPLES - 1);
        sum += sample(center + (uv - center) * (1.0 - strength * t));
    }
    return sum / f32(BLUR_SAMPLES);
}

fn motion_blur(uv: vec2f) -> vec4f {
    let offset = turn_to_dir(param(1u)) * param(0u) * 0.08 / vec2f(aspect(), 1.0);
    var sum = vec4f(0.0);
    for (var i = 0; i < BLUR_SAMPLES; i++) {
        let t = f32(i) / f32(BLUR_SAMPLES - 1) - 0.5;
        sum += sample(uv + offset * t);
    }
    return sum / f32(BLUR_SAMPLES);
}

fn rgb_split(uv: vec2f) -> vec4f {
    let offset = turn_to_dir(param(1u)) * param(0u) * 0.03;
    let center = sample(uv);
    return vec4f(sample(uv + offset).r, center.g, sample(uv - offset).b, center.a);
}

fn glitch(uv: vec2f) -> vec4f {
    let amount = param(0u);
    let rows = mix(60.0, 6.0, param(1u));
    let seed = param(2u) * 100.0;
    let row = floor(uv.y * rows);
    let roll = hash(vec2f(row, seed));
    var shifted = uv;
    if roll < amount * 0.7 {
        shifted.x += (hash(vec2f(seed, row)) - 0.5) * amount * 0.25;
    }
    let split = amount * 0.015;
    let base = sample(shifted);
    var color = vec3f(sample(shifted + vec2f(split, 0.0)).r, base.g, sample(shifted - vec2f(split, 0.0)).b);
    // A few rows flip to their negative, like a corrupted frame.
    if roll < amount * 0.08 {
        color = 1.0 - color;
    }
    return vec4f(color, base.a);
}

fn pixelate(uv: vec2f) -> vec4f {
    let cell = 2.0 + param(0u) * 98.0;
    let cells = uniforms.resolution / cell;
    return sample((floor(uv * cells) + 0.5) / cells);
}

fn posterize(source: vec4f) -> vec4f {
    let levels = max(param(0u) * 16.0, 2.0) - 1.0;
    return vec4f(floor(source.rgb * levels + 0.5) / levels, source.a);
}

fn halftone(uv: vec2f) -> vec4f {
    let cell = 4.0 + param(0u) * 36.0;
    let rotation = mat2x2f(0.7071, -0.7071, 0.7071, 0.7071);
    let pixel = rotation * (uv * uniforms.resolution);
    let cell_center = (floor(pixel / cell) + 0.5) * cell;
    let center_uv = (transpose(rotation) * cell_center) / uniforms.resolution;
    let cell_color = sample(center_uv);
    let radius = sqrt(1.0 - luma(cell_color.rgb)) * cell * 0.7;
    let dot_mask = 1.0 - smoothstep(radius - 1.0, radius + 1.0, distance(pixel, cell_center));
    let ink = mix(vec3f(0.08), cell_color.rgb, param(1u));
    return vec4f(mix(vec3f(0.97, 0.96, 0.92), ink, dot_mask), sample(uv).a);
}

fn sketch(uv: vec2f, texel: vec2f) -> vec4f {
    let edge = sobel(uv, texel * (1.0 + param(1u) * 2.0));
    let line = clamp(edge * (0.5 + param(0u) * 3.0), 0.0, 1.0);
    return vec4f(vec3f(1.0 - line), sample(uv).a);
}

fn mirror(uv: vec2f) -> vec4f {
    let mode = u32(param(0u) + 0.5);
    var mirrored = uv;
    if mode == 0u || mode == 2u {
        mirrored.x = 0.5 - abs(uv.x - 0.5);
    }
    if mode == 1u || mode == 2u {
        mirrored.y = 0.5 - abs(uv.y - 0.5);
    }
    return sample(mirrored);
}

fn kaleidoscope(uv: vec2f) -> vec4f {
    let segments = max(round(param(0u) * 16.0), 2.0);
    let point = to_square(uv);
    let wedge = TAU / segments;
    var angle = atan2(point.y, point.x) + param(1u) * TAU;
    angle = angle - wedge * floor(angle / wedge);
    angle = abs(angle - wedge * 0.5);
    return sample(from_square(vec2f(cos(angle), sin(angle)) * length(point)));
}

fn bulge(uv: vec2f) -> vec4f {
    let radius = max(param(1u), 0.01) * 0.7;
    let point = to_square(uv);
    let t = length(point) / radius;
    if t >= 1.0 {
        return sample(uv);
    }
    let scale = 1.0 - param(0u) * 0.6 * (1.0 - t * t);
    return sample(from_square(point * scale));
}

fn wave(uv: vec2f) -> vec4f {
    let amplitude = param(0u) * 0.05;
    let frequency = 1.0 + param(1u) * 39.0;
    var shifted = uv;
    if param(2u) < 0.5 {
        shifted.x += sin(uv.y * frequency * TAU) * amplitude;
    } else {
        shifted.y += sin(uv.x * frequency * TAU) * amplitude;
    }
    return sample(shifted);
}

fn swirl(uv: vec2f) -> vec4f {
    let radius = max(param(1u), 0.01) * 0.7;
    let point = to_square(uv);
    let t = length(point) / radius;
    if t >= 1.0 {
        return sample(uv);
    }
    let angle = param(0u) * TAU * (1.0 - t) * (1.0 - t);
    let s = sin(angle);
    let c = cos(angle);
    return sample(from_square(vec2f(point.x * c - point.y * s, point.x * s + point.y * c)));
}

fn duotone(source: vec4f) -> vec4f {
    let dark = hue_to_rgb(param(0u)) * 0.3;
    let light = mix(hue_to_rgb(param(1u)), vec3f(1.0), 0.35);
    let contrast = 1.0 + param(2u);
    let tone = clamp((luma(source.rgb) - 0.5) * contrast + 0.5, 0.0, 1.0);
    return vec4f(mix(dark, light, tone), source.a);
}

fn vhs(uv: vec2f) -> vec4f {
    let shift = param(1u) * 0.012;
    let base = sample(uv);
    var color = vec3f(sample(uv + vec2f(shift, 0.0)).r, base.g, sample(uv - vec2f(shift, 0.0)).b);
    let line = sin(uv.y * uniforms.resolution.y * 1.5) * 0.5 + 0.5;
    color *= 1.0 - param(0u) * 0.45 * line;
    color += (hash(uv * uniforms.resolution) - 0.5) * param(2u) * 0.3;
    color = mix(vec3f(luma(color)), color, 0.85);
    return vec4f(color, base.a);
}

fn glow(uv: vec2f, texel: vec2f, source: vec4f) -> vec4f {
    let threshold = param(1u);
    let radius = (2.0 + param(2u) * 30.0) * texel;
    var bloom = vec3f(0.0);
    var weight = 0.0;
    for (var ring = 1; ring <= 3; ring++) {
        for (var i = 0; i < 12; i++) {
            let dir = turn_to_dir((f32(i) + f32(ring) * 0.5) / 12.0);
            let tap = sample(uv + dir * radius * f32(ring) / 3.0).rgb;
            let w = 1.0 / f32(ring);
            bloom += max(tap - vec3f(threshold), vec3f(0.0)) * w;
            weight += w;
        }
    }
    return vec4f(source.rgb + bloom / weight * param(0u) * 4.0, source.a);
}

fn emboss(uv: vec2f, texel: vec2f) -> vec4f {
    let offset = texel * (1.0 + param(1u) * 3.0);
    let difference = luma(sample(uv - offset).rgb) - luma(sample(uv + offset).rgb);
    return vec4f(vec3f(0.5 + difference * (1.0 + param(0u) * 6.0)), sample(uv).a);
}

fn old_film(uv: vec2f, source: vec4f) -> vec4f {
    let gray = luma(source.rgb);
    var color = vec3f(gray * 1.07, gray * 0.74, gray * 0.43) + vec3f(0.08, 0.05, 0.0);
    let vignette = smoothstep(0.85, 0.25, length(to_square(uv)));
    color *= mix(1.0, vignette, param(1u));
    color += (hash(uv * uniforms.resolution) - 0.5) * param(2u) * 0.25;
    // sparse vertical scratches
    let scratch = step(0.997, hash(vec2f(floor(uv.x * uniforms.resolution.x * 0.5), 1.0)));
    color = mix(color, vec3f(0.9), scratch * param(2u) * 0.6);
    return vec4f(mix(source.rgb, color, param(0u)), source.a);
}

fn neon_edges(uv: vec2f, texel: vec2f) -> vec4f {
    let edge = clamp(sobel(uv, texel * 1.5) * (1.0 + param(0u) * 4.0), 0.0, 1.0);
    let hue = param(1u) + uv.y * param(2u);
    return vec4f(hue_to_rgb(hue) * edge * 1.4, sample(uv).a);
}

fn invert(source: vec4f) -> vec4f {
    return vec4f(1.0 - source.rgb, source.a);
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let uv = input.tex_coord;
    let texel = vec2f(1.0) / uniforms.resolution;
    let source = sample(uv);
    let mode = u32(slot(0u) + 0.5);

    var result = source;
    switch mode {
        case 0u: { result = zoom_blur(uv); }
        case 1u: { result = motion_blur(uv); }
        case 2u: { result = rgb_split(uv); }
        case 3u: { result = glitch(uv); }
        case 4u: { result = pixelate(uv); }
        case 5u: { result = invert(source); }
        case 6u: { result = posterize(source); }
        case 7u: { result = halftone(uv); }
        case 8u: { result = sketch(uv, texel); }
        case 9u: { result = mirror(uv); }
        case 10u: { result = kaleidoscope(uv); }
        case 11u: { result = bulge(uv); }
        case 12u: { result = wave(uv); }
        case 13u: { result = swirl(uv); }
        case 14u: { result = duotone(source); }
        case 15u: { result = vhs(uv); }
        case 16u: { result = glow(uv, texel, source); }
        case 17u: { result = emboss(uv, texel); }
        case 18u: { result = old_film(uv, source); }
        case 19u: { result = neon_edges(uv, texel); }
        default: {}
    }

    return mix(source, clamp(result, vec4f(0.0), vec4f(1.0)), slot(1u));
}
