import { create } from "zustand";
import { persist } from "zustand/middleware";

// 이름·상호·고유명사 사전. 모든 프로젝트 공통이며 인식할 때 Whisper에 힌트로 넘긴다
interface TranscriptionTermsState {
	terms: string[];
	setTerms: (terms: string[]) => void;
}

export const useTranscriptionTerms = create<TranscriptionTermsState>()(
	persist(
		(set) => ({
			terms: [],
			setTerms: (terms) => set({ terms }),
		}),
		{ name: "transcription-terms" },
	),
);

/** 쉼표나 줄바꿈으로 구분한 입력을 용어 목록으로 바꾼다 */
export function parseTerms({ input }: { input: string }): string[] {
	return [
		...new Set(
			input
				.split(/[,\n]/)
				.map((term) => term.trim())
				.filter(Boolean),
		),
	];
}
