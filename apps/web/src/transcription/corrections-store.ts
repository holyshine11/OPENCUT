import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Correction, extractCorrections, mergeCorrections } from "./correction";
import settings from "./settings.json";

// 자막을 고칠 때마다 배우는 오인식 사전. 모든 프로젝트 공통이며 다음 받아쓰기 결과를 고친다.
// Whisper 프롬프트 힌트로는 넘기지 않는다. 한 단어만 넣어도 말을 통째로 빼먹거나 같은 말을 되풀이했다(2026-10-20 test.mp4)
interface TranscriptionCorrectionsState {
	corrections: Correction[];
	learn: (params: { pairs: readonly { from: string; to: string }[]; count?: number }) => void;
	remove: (params: { from: string }) => void;
}

export const useTranscriptionCorrections = create<TranscriptionCorrectionsState>()(
	persist(
		(set) => ({
			corrections: [],
			learn: ({ pairs, count }) =>
				set((state) => ({
					corrections: mergeCorrections({ corrections: state.corrections, learned: pairs, count }),
				})),
			remove: ({ from }) =>
				set((state) => ({
					corrections: state.corrections.filter((correction) => correction.from !== from),
				})),
		}),
		{ name: "transcription-corrections" },
	),
);

/** 자동 자막 한 줄을 고쳤을 때 바뀐 낱말을 배운다 */
export function learnFromSubtitleEdit({ before, after }: { before: string; after: string }): void {
	const pairs = extractCorrections({ before, after, maxPhraseWords: settings.correction.maxPhraseWords });
	if (pairs.length > 0) useTranscriptionCorrections.getState().learn({ pairs });
}
