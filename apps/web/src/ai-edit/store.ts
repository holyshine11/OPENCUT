import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	AI_EDIT_EFFORTS,
	type AiEditEffort,
	AI_EDIT_MODELS,
	DEFAULT_AI_EDIT_EFFORT,
	DEFAULT_AI_EDIT_MODEL,
} from "./models";
import { type EditFormat, type EditPlan, FORMAT_IDS } from "./plan";

export const AI_EDIT_STEPS = 5;
const MAX_RECENT_HOOKS = 10;

export type AiEditJob =
	| { status: "idle" }
	| { status: "running"; step: number; log: string[]; abort: AbortController }
	| { status: "done"; plan: EditPlan; log: string[] }
	| { status: "failed"; error: string; log: string[] };

interface AiEditStore {
	model: string;
	effort: AiEditEffort;
	format: EditFormat;
	/** 남편 대사를 읽을 목소리 이름. null이면 아내와 다른 첫 목소리 */
	husbandVoice: string | null;
	/** 최근에 쓴 훅. 다음 편집이 같은 틀을 피하게 프롬프트에 넣는다 */
	recentHooks: string[];
	job: AiEditJob;
	setModel: (model: string) => void;
	setEffort: (effort: string) => void;
	setFormat: (format: string) => void;
	setHusbandVoice: (voice: string) => void;
	rememberHook: (hook: string) => void;
}

export const useAiEditStore = create<AiEditStore>()(
	persist(
		(set) => ({
			model: DEFAULT_AI_EDIT_MODEL,
			effort: DEFAULT_AI_EDIT_EFFORT,
			format: "short",
			husbandVoice: null,
			recentHooks: [],
			job: { status: "idle" },
			setModel: (model) => {
				if (AI_EDIT_MODELS.some((item) => item.id === model)) set({ model });
			},
			setEffort: (effort) => {
				const found = AI_EDIT_EFFORTS.find((item) => item === effort);
				if (found) set({ effort: found });
			},
			setFormat: (format) => {
				const found = FORMAT_IDS.find((id) => id === format);
				if (found) set({ format: found });
			},
			setHusbandVoice: (husbandVoice) => set({ husbandVoice }),
			rememberHook: (hook) =>
				set((state) => ({
					recentHooks: hook ? [hook, ...state.recentHooks].slice(0, MAX_RECENT_HOOKS) : state.recentHooks,
				})),
		}),
		{
			name: "ai-edit",
			partialize: ({ model, effort, format, husbandVoice, recentHooks }) => ({ model, effort, format, husbandVoice, recentHooks }),
		},
	),
);
