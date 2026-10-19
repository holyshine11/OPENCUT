// 한국어 고정, 영어만 고를 수 있게 한다. 자동 감지는 짧은 영상에서 언어를 잘못 고르는 일이 있어 넣지 않는다
export const LANGUAGES = [
	{ code: "ko", name: "Korean" },
	{ code: "en", name: "English" },
] as const;

export type Language = (typeof LANGUAGES)[number];
export type LanguageCode = Language["code"];

export const DEFAULT_TRANSCRIPTION_LANGUAGE: LanguageCode = "ko";
