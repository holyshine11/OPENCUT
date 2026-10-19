import type { LanguageCode } from "./languages";

export type TranscriptionLanguage = LanguageCode;

export interface TranscriptionWord {
	text: string;
	start: number;
	end: number;
}

export interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
	words?: TranscriptionWord[];
}

export interface TranscriptionResult {
	text: string;
	segments: TranscriptionSegment[];
	language: string;
}

export type TranscriptionStatus =
	| "idle"
	| "loading-model"
	| "transcribing"
	| "complete"
	| "error";

export interface TranscriptionProgress {
	status: TranscriptionStatus;
	progress: number;
	message?: string;
}

export interface CaptionChunk {
	text: string;
	startTime: number;
	duration: number;
}

/** 자막 한 개를 만드는 기준. 숏폼·롱폼 권장값은 `settings.json`의 `captionLayout`에 있다 */
export interface CaptionLayout {
	maxCharsPerLine: number;
	maxLines: number;
	minDuration: number;
	maxDuration: number;
	stripPunctuation: boolean;
}
