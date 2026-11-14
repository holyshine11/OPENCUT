import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AI_EDIT_MODELS, DEFAULT_AI_EDIT_MODEL } from "./models";
import type { EditPlan } from "./plan";

export const AI_EDIT_STEPS = 5;
const MAX_RECENT_HOOKS = 10;

export type AiEditJob =
	| { status: "idle" }
	| { status: "running"; step: number; log: string[]; abort: AbortController }
	| { status: "done"; plan: EditPlan; log: string[] }
	| { status: "failed"; error: string; log: string[] };

interface AiEditStore {
	model: string;
	/** 최근에 쓴 훅. 다음 편집이 같은 틀을 피하게 프롬프트에 넣는다 */
	recentHooks: string[];
	job: AiEditJob;
	setModel: (model: string) => void;
	rememberHook: (hook: string) => void;
}

export const useAiEditStore = create<AiEditStore>()(
	persist(
		(set) => ({
			model: DEFAULT_AI_EDIT_MODEL,
			recentHooks: [],
			job: { status: "idle" },
			setModel: (model) => {
				if (AI_EDIT_MODELS.some((item) => item.id === model)) set({ model });
			},
			rememberHook: (hook) =>
				set((state) => ({
					recentHooks: hook ? [hook, ...state.recentHooks].slice(0, MAX_RECENT_HOOKS) : state.recentHooks,
				})),
		}),
		{
			name: "ai-edit",
			partialize: ({ model, recentHooks }) => ({ model, recentHooks }),
		},
	),
);
