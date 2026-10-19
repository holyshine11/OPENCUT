import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParamValues } from "@/params";
import { generateUUID } from "@/utils/id";

// 사용자가 이름을 붙여 저장한 텍스트 스타일. 맥북 안(브라우저 저장소)에 두고 모든 프로젝트에서 같이 쓴다
export interface TextStylePreset {
	id: string;
	name: string;
	style: ParamValues;
}

interface TextStylePresetsState {
	presets: TextStylePreset[];
	add: (args: { name: string; style: ParamValues }) => string;
	rename: (args: { id: string; name: string }) => void;
	remove: (args: { id: string }) => void;
}

export const useTextStylePresets = create<TextStylePresetsState>()(
	persist(
		(set, get) => ({
			presets: [],
			add: ({ name, style }) => {
				const id = generateUUID();
				const presets = get().presets;
				set({
					presets: [
						...presets,
						{ id, name: name.trim() || `Style ${presets.length + 1}`, style },
					],
				});
				return id;
			},
			rename: ({ id, name }) => {
				const trimmed = name.trim();
				if (!trimmed) return;
				set((state) => ({
					presets: state.presets.map((preset) =>
						preset.id === id ? { ...preset, name: trimmed } : preset,
					),
				}));
			},
			remove: ({ id }) =>
				set((state) => ({ presets: state.presets.filter((preset) => preset.id !== id) })),
		}),
		{ name: "text-style-presets" },
	),
);
