import type { ParamValues } from "@/params";
import { buildDefaultAdjustParams } from "./adjust";

export interface AdjustPreset {
	id: string;
	/** English label, translated through messages.labels */
	name: string;
	params: ParamValues;
}

export const ADJUST_PRESETS: AdjustPreset[] = [
	{
		id: "vivid",
		name: "Vivid",
		params: { contrast: 18, vibrance: 40, saturation: 8, sharpen: 20 },
	},
	{
		// warm, glossy and crisp: vibrance over saturation keeps sauces from clipping
		id: "food",
		name: "Food",
		params: {
			temperature: 15,
			tint: 4,
			exposure: 0.1,
			contrast: 12,
			highlights: -15,
			shadows: 15,
			vibrance: 35,
			saturation: 8,
			sharpen: 30,
			vignette: 10,
		},
	},
	{
		id: "bright-airy",
		name: "Bright & Airy",
		params: {
			exposure: 0.3,
			shadows: 30,
			highlights: -20,
			contrast: -12,
			vibrance: 12,
			temperature: 5,
		},
	},
	{
		id: "warm",
		name: "Warm",
		params: { temperature: 35, tint: 6, vibrance: 10 },
	},
	{
		id: "cool",
		name: "Cool",
		params: { temperature: -35, tint: -4, highlights: -5 },
	},
	{
		id: "golden-hour",
		name: "Golden Hour",
		params: {
			temperature: 40,
			exposure: 0.1,
			highlights: -15,
			highlightHue: 35,
			highlightAmount: 30,
			vibrance: 15,
		},
	},
	{
		id: "teal-orange",
		name: "Teal & Orange",
		params: {
			contrast: 18,
			shadowHue: 190,
			shadowAmount: 40,
			highlightHue: 30,
			highlightAmount: 30,
			saturation: -5,
			vignette: 15,
		},
	},
	{
		id: "moody",
		name: "Moody",
		params: {
			exposure: -0.25,
			contrast: 22,
			highlights: -30,
			saturation: -25,
			shadowHue: 220,
			shadowAmount: 25,
			vignette: 30,
		},
	},
	{
		id: "dramatic",
		name: "Dramatic",
		params: {
			contrast: 40,
			highlights: -35,
			shadows: 20,
			blacks: -15,
			saturation: -10,
			sharpen: 15,
			vignette: 35,
		},
	},
	{
		id: "vintage",
		name: "Vintage Film",
		params: {
			fade: 35,
			temperature: 15,
			saturation: -20,
			contrast: -10,
			highlightHue: 45,
			highlightAmount: 20,
			grain: 30,
		},
	},
	{
		id: "matte",
		name: "Matte",
		params: { fade: 45, contrast: -15, saturation: -15, blacks: 10 },
	},
	{
		id: "cross-process",
		name: "Cross Process",
		params: {
			tint: 15,
			contrast: 15,
			shadowHue: 160,
			shadowAmount: 35,
			highlightHue: 55,
			highlightAmount: 30,
		},
	},
	{
		id: "mono",
		name: "Black & White",
		params: { saturation: -100, contrast: 15 },
	},
	{
		id: "noir",
		name: "Noir",
		params: {
			saturation: -100,
			contrast: 45,
			blacks: -20,
			highlights: -10,
			vignette: 40,
			grain: 20,
		},
	},
];

/** Preset values over neutral defaults, so applying a preset replaces earlier tweaks. */
export function buildAdjustPresetParams(
	preset: AdjustPreset | null,
): ParamValues {
	return { ...buildDefaultAdjustParams(), ...preset?.params };
}

export function findMatchingAdjustPreset(
	params: ParamValues,
): AdjustPreset | null {
	return (
		ADJUST_PRESETS.find((preset) => {
			const expected = buildAdjustPresetParams(preset);
			return Object.entries(expected).every(
				([key, value]) => key === "amount" || params[key] === value,
			);
		}) ?? null
	);
}
