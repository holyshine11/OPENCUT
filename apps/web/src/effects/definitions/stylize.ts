import type {
	NumberParamDefinition,
	ParamDefinition,
	ParamValues,
	SelectParamDefinition,
} from "@/params";
import type { EffectCategory, EffectDefinition } from "@/effects/types";

export const STYLIZE_SHADER = "stylize";
export const STYLIZE_MIX_KEY = "mix";

const SHADER_PARAM_SLOTS = 28;

function slider({
	key,
	label,
	min = 0,
	max = 100,
	defaultValue = 50,
}: {
	key: string;
	label: string;
	min?: number;
	max?: number;
	defaultValue?: number;
}): NumberParamDefinition {
	return {
		key,
		label,
		type: "number",
		default: defaultValue,
		min,
		max,
		step: 1,
		slider: true,
	};
}

const angle = (defaultValue = 0) =>
	slider({ key: "angle", label: "Angle", max: 360, defaultValue });

function select({
	key,
	label,
	options,
}: {
	key: string;
	label: string;
	options: string[];
}): SelectParamDefinition {
	return {
		key,
		label,
		type: "select",
		default: options[0],
		options: options.map((value) => ({ value, label: value })),
	};
}

interface StylizeSpec {
	type: string;
	name: string;
	category: EffectCategory;
	keywords: string[];
	params: ParamDefinition[];
}

// Index is the shader mode in rust/crates/effects/src/shaders/stylize.wgsl; append only.
const STYLIZE_SPECS: StylizeSpec[] = [
	{
		type: "zoom-blur",
		name: "Zoom Blur",
		category: "blur",
		keywords: ["zoom", "radial", "blur", "speed"],
		params: [
			slider({ key: "intensity", label: "Intensity", defaultValue: 40 }),
			slider({ key: "centerX", label: "Center X", min: -100, defaultValue: 0 }),
			slider({ key: "centerY", label: "Center Y", min: -100, defaultValue: 0 }),
		],
	},
	{
		type: "motion-blur",
		name: "Motion Blur",
		category: "blur",
		keywords: ["motion", "directional", "blur", "speed"],
		params: [slider({ key: "intensity", label: "Intensity", defaultValue: 40 }), angle()],
	},
	{
		type: "rgb-split",
		name: "RGB Split",
		category: "glitch",
		keywords: ["chromatic", "aberration", "rgb", "split"],
		params: [slider({ key: "intensity", label: "Intensity", defaultValue: 30 }), angle()],
	},
	{
		type: "glitch",
		name: "Glitch",
		category: "glitch",
		keywords: ["glitch", "digital", "error", "distort"],
		params: [
			slider({ key: "intensity", label: "Intensity", defaultValue: 50 }),
			slider({ key: "blockSize", label: "Block Size", defaultValue: 40 }),
			slider({ key: "seed", label: "Variation", defaultValue: 10 }),
		],
	},
	{
		type: "pixelate",
		name: "Pixelate",
		category: "stylize",
		keywords: ["pixel", "mosaic", "8bit", "retro"],
		params: [slider({ key: "size", label: "Size", defaultValue: 15 })],
	},
	{
		type: "invert",
		name: "Invert",
		category: "color",
		keywords: ["invert", "negative"],
		params: [],
	},
	{
		type: "posterize",
		name: "Posterize",
		category: "color",
		keywords: ["posterize", "levels", "cartoon"],
		params: [slider({ key: "levels", label: "Levels", min: 2, max: 16, defaultValue: 5 })],
	},
	{
		type: "halftone",
		name: "Halftone",
		category: "stylize",
		keywords: ["halftone", "dots", "comic", "print"],
		params: [
			slider({ key: "size", label: "Size", defaultValue: 20 }),
			slider({ key: "color", label: "Color", defaultValue: 0 }),
		],
	},
	{
		type: "sketch",
		name: "Sketch",
		category: "stylize",
		keywords: ["sketch", "pencil", "drawing", "edge"],
		params: [
			slider({ key: "intensity", label: "Intensity", defaultValue: 40 }),
			slider({ key: "thickness", label: "Thickness", defaultValue: 0 }),
		],
	},
	{
		type: "mirror",
		name: "Symmetry",
		category: "distort",
		keywords: ["mirror", "symmetry", "reflect"],
		params: [select({ key: "axis", label: "Axis", options: ["Horizontal", "Vertical", "Both"] })],
	},
	{
		type: "kaleidoscope",
		name: "Kaleidoscope",
		category: "distort",
		keywords: ["kaleidoscope", "symmetry", "trippy"],
		params: [
			slider({ key: "segments", label: "Segments", min: 2, max: 16, defaultValue: 6 }),
			slider({ key: "rotation", label: "Rotation", max: 360, defaultValue: 0 }),
		],
	},
	{
		type: "bulge",
		name: "Bulge",
		category: "distort",
		keywords: ["bulge", "fisheye", "pinch", "lens"],
		params: [
			slider({ key: "intensity", label: "Intensity", min: -100, defaultValue: 50 }),
			slider({ key: "radius", label: "Radius", defaultValue: 70 }),
		],
	},
	{
		type: "wave",
		name: "Wave",
		category: "distort",
		keywords: ["wave", "ripple", "wobble", "water"],
		params: [
			slider({ key: "intensity", label: "Intensity", defaultValue: 30 }),
			slider({ key: "frequency", label: "Frequency", defaultValue: 20 }),
			select({ key: "direction", label: "Direction", options: ["Horizontal", "Vertical"] }),
		],
	},
	{
		type: "swirl",
		name: "Swirl",
		category: "distort",
		keywords: ["swirl", "twirl", "twist", "vortex"],
		params: [
			slider({ key: "intensity", label: "Intensity", min: -100, defaultValue: 40 }),
			slider({ key: "radius", label: "Radius", defaultValue: 70 }),
		],
	},
	{
		type: "duotone",
		name: "Duotone",
		category: "color",
		keywords: ["duotone", "gradient map", "two tone"],
		params: [
			slider({ key: "shadowHue", label: "Shadow Hue", max: 360, defaultValue: 250 }),
			slider({ key: "highlightHue", label: "Highlight Hue", max: 360, defaultValue: 330 }),
			slider({ key: "contrast", label: "Contrast", min: -100, defaultValue: 0 }),
		],
	},
	{
		type: "vhs",
		name: "VHS",
		category: "retro",
		keywords: ["vhs", "scanline", "tape", "retro", "crt"],
		params: [
			slider({ key: "scanlines", label: "Scanlines", defaultValue: 40 }),
			slider({ key: "colorShift", label: "Color Shift", defaultValue: 30 }),
			slider({ key: "noise", label: "Noise", defaultValue: 30 }),
		],
	},
	{
		type: "glow",
		name: "Glow",
		category: "stylize",
		keywords: ["glow", "bloom", "dreamy", "light"],
		params: [
			slider({ key: "intensity", label: "Intensity", defaultValue: 40 }),
			slider({ key: "threshold", label: "Threshold", defaultValue: 60 }),
			slider({ key: "radius", label: "Radius", defaultValue: 40 }),
		],
	},
	{
		type: "emboss",
		name: "Emboss",
		category: "stylize",
		keywords: ["emboss", "relief", "stone"],
		params: [
			slider({ key: "intensity", label: "Intensity", defaultValue: 30 }),
			slider({ key: "thickness", label: "Thickness", defaultValue: 0 }),
		],
	},
	{
		type: "old-film",
		name: "Old Film",
		category: "retro",
		keywords: ["old film", "sepia", "vintage", "scratch"],
		params: [
			slider({ key: "intensity", label: "Intensity", defaultValue: 100 }),
			slider({ key: "vignette", label: "Vignette", defaultValue: 60 }),
			slider({ key: "noise", label: "Noise", defaultValue: 40 }),
		],
	},
	{
		type: "neon-edges",
		name: "Neon Edges",
		category: "stylize",
		keywords: ["neon", "edge", "glow", "outline"],
		params: [
			slider({ key: "intensity", label: "Intensity", defaultValue: 40 }),
			slider({ key: "hue", label: "Hue", max: 360, defaultValue: 190 }),
			slider({ key: "gradient", label: "Gradient", defaultValue: 50 }),
		],
	},
];

const mixParam = slider({ key: STYLIZE_MIX_KEY, label: "Mix", defaultValue: 100 });

function readParam({
	param,
	raw,
}: {
	param: ParamDefinition;
	raw: unknown;
}): number {
	if (param.type === "select") {
		return Math.max(
			0,
			param.options.findIndex((option) => option.value === raw),
		);
	}
	if (param.type !== "number") return 0;
	const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
	const resolved = Number.isFinite(value) ? value : param.default;
	const scale = Math.max(Math.abs(param.min ?? 0), Math.abs(param.max ?? 1));
	return resolved / scale;
}

export function buildStylizeUniform({
	mode,
	params,
	effectParams,
}: {
	mode: number;
	params: ParamDefinition[];
	effectParams: ParamValues;
}): number[] {
	const values = [
		mode,
		readParam({ param: mixParam, raw: effectParams[STYLIZE_MIX_KEY] }),
		...params.map((param) => readParam({ param, raw: effectParams[param.key] })),
	];
	return [...values, ...new Array(SHADER_PARAM_SLOTS - values.length).fill(0)];
}

export const stylizeEffectDefinitions: EffectDefinition[] = STYLIZE_SPECS.map(
	({ params, ...spec }, mode) => {
		const uniforms = (effectParams: ParamValues) => ({
			u_params: buildStylizeUniform({ mode, params, effectParams }),
		});
		return {
			...spec,
			params: [...params, mixParam],
			renderer: {
				passes: [
					{
						shader: STYLIZE_SHADER,
						uniforms: ({ effectParams }) => uniforms(effectParams),
					},
				],
				buildPasses: ({ effectParams }) =>
					Number(effectParams[STYLIZE_MIX_KEY] ?? 100) === 0
						? []
						: [{ shader: STYLIZE_SHADER, uniforms: uniforms(effectParams) }],
			},
		};
	},
);
