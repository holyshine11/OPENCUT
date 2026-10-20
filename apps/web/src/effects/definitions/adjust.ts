import type { NumberParamDefinition, ParamValues } from "@/params";
import type { EffectDefinition } from "@/effects/types";

export const ADJUST_EFFECT_TYPE = "adjust";
export const COLOR_ADJUST_SHADER = "color-adjust";

export type AdjustSectionId =
	| "whiteBalance"
	| "tone"
	| "color"
	| "creative"
	| "wheels"
	| "vignette"
	| "grain";

/** hue: 0~360 turns, track: slider background hint for the UI */
export type AdjustSliderTrack = "hue" | "temperature" | "tint";

export interface AdjustSlider {
	key: string;
	label: string;
	section: AdjustSectionId | null;
	min: number;
	max: number;
	step: number;
	default: number;
	hue?: boolean;
	track?: AdjustSliderTrack;
}

const RANGES = {
	bipolar: { min: -100, max: 100 },
	unipolar: { min: 0, max: 100 },
	hue: { min: 0, max: 360 },
};

function defineSlider({
	kind,
	defaultValue = 0,
	...rest
}: Pick<AdjustSlider, "key" | "label" | "section" | "track"> & {
	kind: keyof typeof RANGES;
	defaultValue?: number;
}): AdjustSlider {
	return {
		...rest,
		...RANGES[kind],
		step: 1,
		default: defaultValue,
		...(kind === "hue" && { hue: true, track: "hue" }),
	};
}

// Order is the u_params slot layout in rust/crates/effects/src/shaders/color_adjust.wgsl.
export const ADJUST_SLIDERS: AdjustSlider[] = [
	defineSlider({
		kind: "bipolar",
		key: "temperature",
		label: "Temperature",
		section: "whiteBalance",
		track: "temperature",
	}),
	defineSlider({
		kind: "bipolar",
		key: "tint",
		label: "Tint",
		section: "whiteBalance",
		track: "tint",
	}),
	{
		key: "exposure",
		label: "Exposure",
		section: "tone",
		min: -2,
		max: 2,
		step: 0.05,
		default: 0,
	},
	defineSlider({
		kind: "bipolar",
		key: "contrast",
		label: "Contrast",
		section: "tone",
	}),
	defineSlider({
		kind: "bipolar",
		key: "highlights",
		label: "Highlights",
		section: "tone",
	}),
	defineSlider({
		kind: "bipolar",
		key: "shadows",
		label: "Shadows",
		section: "tone",
	}),
	defineSlider({
		kind: "bipolar",
		key: "whites",
		label: "Whites",
		section: "tone",
	}),
	defineSlider({
		kind: "bipolar",
		key: "blacks",
		label: "Blacks",
		section: "tone",
	}),
	defineSlider({
		kind: "bipolar",
		key: "brightness",
		label: "Brightness",
		section: "tone",
	}),
	defineSlider({
		kind: "bipolar",
		key: "saturation",
		label: "Saturation",
		section: "color",
	}),
	defineSlider({
		kind: "bipolar",
		key: "vibrance",
		label: "Vibrance",
		section: "color",
	}),
	defineSlider({
		kind: "unipolar",
		key: "fade",
		label: "Faded Film",
		section: "creative",
	}),
	defineSlider({
		kind: "unipolar",
		key: "sharpen",
		label: "Sharpen",
		section: "creative",
	}),
	defineSlider({
		kind: "unipolar",
		key: "amount",
		label: "Amount",
		section: null,
		defaultValue: 100,
	}),
	defineSlider({
		kind: "unipolar",
		key: "grain",
		label: "Grain",
		section: "grain",
	}),
	defineSlider({
		kind: "unipolar",
		key: "grainSize",
		label: "Grain Size",
		section: "grain",
		defaultValue: 25,
	}),
	defineSlider({
		kind: "hue",
		key: "shadowHue",
		label: "Shadow Hue",
		section: "wheels",
		defaultValue: 200,
	}),
	defineSlider({
		kind: "unipolar",
		key: "shadowAmount",
		label: "Shadow Tint",
		section: "wheels",
	}),
	defineSlider({
		kind: "hue",
		key: "midtoneHue",
		label: "Midtone Hue",
		section: "wheels",
		defaultValue: 30,
	}),
	defineSlider({
		kind: "unipolar",
		key: "midtoneAmount",
		label: "Midtone Tint",
		section: "wheels",
	}),
	defineSlider({
		kind: "hue",
		key: "highlightHue",
		label: "Highlight Hue",
		section: "wheels",
		defaultValue: 40,
	}),
	defineSlider({
		kind: "unipolar",
		key: "highlightAmount",
		label: "Highlight Tint",
		section: "wheels",
	}),
	defineSlider({
		kind: "bipolar",
		key: "vignette",
		label: "Vignette",
		section: "vignette",
	}),
	defineSlider({
		kind: "unipolar",
		key: "vignetteMidpoint",
		label: "Midpoint",
		section: "vignette",
		defaultValue: 50,
	}),
	defineSlider({
		kind: "bipolar",
		key: "vignetteRoundness",
		label: "Roundness",
		section: "vignette",
	}),
	defineSlider({
		kind: "unipolar",
		key: "vignetteFeather",
		label: "Feather",
		section: "vignette",
		defaultValue: 50,
	}),
];

export const ADJUST_SLIDERS_BY_KEY: Record<string, AdjustSlider> =
	Object.fromEntries(ADJUST_SLIDERS.map((slider) => [slider.key, slider]));

export const ADJUST_SECTIONS: Array<{
	id: AdjustSectionId;
	label: string;
	defaultOpen: boolean;
}> = [
	{ id: "whiteBalance", label: "White Balance", defaultOpen: true },
	{ id: "tone", label: "Tone", defaultOpen: true },
	{ id: "color", label: "Color Tone", defaultOpen: true },
	{ id: "creative", label: "Creative", defaultOpen: false },
	{ id: "wheels", label: "Color Wheels", defaultOpen: false },
	{ id: "vignette", label: "Vignette", defaultOpen: false },
	{ id: "grain", label: "Grain", defaultOpen: false },
];

const SHADER_PARAM_SLOTS = 28;

function readNumber({
	effectParams,
	slider,
}: {
	effectParams: Record<string, unknown>;
	slider: AdjustSlider;
}): number {
	const raw = effectParams[slider.key];
	const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
	return Number.isFinite(value) ? value : slider.default;
}

// These only shape another slider (hue of a tint, size of grain, …) and change nothing on their own.
const MODIFIER_KEYS = new Set([
	"amount",
	"grainSize",
	"shadowHue",
	"midtoneHue",
	"highlightHue",
	"vignetteMidpoint",
	"vignetteRoundness",
	"vignetteFeather",
]);

export function isNeutralAdjust(
	effectParams: Record<string, unknown>,
): boolean {
	if (readNumber({ effectParams, slider: ADJUST_SLIDERS_BY_KEY.amount }) === 0)
		return true;
	return ADJUST_SLIDERS.every(
		(slider) =>
			MODIFIER_KEYS.has(slider.key) ||
			readNumber({ effectParams, slider }) === slider.default,
	);
}

export function buildAdjustUniform(
	effectParams: Record<string, unknown>,
): number[] {
	const values = ADJUST_SLIDERS.map((slider) => {
		const value = readNumber({ effectParams, slider });
		if (slider.hue) return value / 360;
		return value / Math.max(Math.abs(slider.min), Math.abs(slider.max));
	});
	return [...values, ...new Array(SHADER_PARAM_SLOTS - values.length).fill(0)];
}

export function buildDefaultAdjustParams(): ParamValues {
	return Object.fromEntries(
		ADJUST_SLIDERS.map((slider) => [slider.key, slider.default]),
	);
}

function toParamDefinition(slider: AdjustSlider): NumberParamDefinition {
	return {
		key: slider.key,
		label: slider.label,
		type: "number",
		default: slider.default,
		min: slider.min,
		max: slider.max,
		step: slider.step,
		slider: true,
	};
}

export const adjustEffectDefinition: EffectDefinition = {
	type: ADJUST_EFFECT_TYPE,
	name: "Adjust",
	keywords: [
		"adjust",
		"color",
		"lumetri",
		"grade",
		"brightness",
		"contrast",
		"saturation",
	],
	params: ADJUST_SLIDERS.map(toParamDefinition),
	renderer: {
		passes: [
			{
				shader: COLOR_ADJUST_SHADER,
				uniforms: ({ effectParams }) => ({
					u_params: buildAdjustUniform(effectParams),
				}),
			},
		],
		buildPasses: ({ effectParams }) => {
			if (isNeutralAdjust(effectParams)) return [];
			return [
				{
					shader: COLOR_ADJUST_SHADER,
					uniforms: { u_params: buildAdjustUniform(effectParams) },
				},
			];
		},
	},
};
