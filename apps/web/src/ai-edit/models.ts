/** AI 자동 편집에 고를 수 있는 Claude 모델. 구독 요금제에 따라 못 쓰는 모델은 실행할 때 claude가 알려 준다 */
export const AI_EDIT_MODELS = [
	{ id: "claude-sonnet-5-5", name: "Sonnet 5.5" },
	{ id: "claude-opus-5-5", name: "Opus 5.5" },
	{ id: "claude-fable-5-2", name: "Fable 5.2" },
	{ id: "claude-haiku-5-5", name: "Haiku 5.5" },
] as const;

export const DEFAULT_AI_EDIT_MODEL = AI_EDIT_MODELS[0].id;

/** 추론 강도. claude의 --effort에 그대로 넘긴다. 높을수록 꼼꼼하지만 느리고 사용량이 많다 */
export const AI_EDIT_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AiEditEffort = (typeof AI_EDIT_EFFORTS)[number];
export const DEFAULT_AI_EDIT_EFFORT: AiEditEffort = "high";
