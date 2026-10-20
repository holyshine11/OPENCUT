import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParamValues } from "@/params";
import { generateUUID } from "@/utils/id";

// 사용자가 저장한 효과·조정 값. 브라우저별로 남는다
export interface UserEffectPreset {
	id: string;
	effectType: string;
	name: string;
	params: ParamValues;
}

interface EffectPresetsState {
	presets: UserEffectPreset[];
	add: (preset: Omit<UserEffectPreset, "id">) => UserEffectPreset;
	remove: ({ id }: { id: string }) => void;
}

export const useEffectPresets = create<EffectPresetsState>()(
	persist(
		(set) => ({
			presets: [],
			add: (preset) => {
				const saved = { ...preset, id: generateUUID() };
				set((state) => ({ presets: [...state.presets, saved] }));
				return saved;
			},
			remove: ({ id }) =>
				set((state) => ({
					presets: state.presets.filter((preset) => preset.id !== id),
				})),
		}),
		{ name: "effect-user-presets" },
	),
);

export function isSameParams({
	params,
	preset,
}: {
	params: ParamValues;
	preset: ParamValues;
}): boolean {
	return Object.entries(preset).every(([key, value]) => params[key] === value);
}
