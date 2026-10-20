import { detectSpeechRegions, type TimeRange } from "@/transcription/speech-regions";
import type settingsFile from "./settings.json";

export type AutocutSettings = typeof settingsFile;

/** VAD가 말소리로 본 구간과 받아쓴 단어 구간. 겹쳐도 합치지 않는다 */
export function collectSpeechRanges({
	probabilities,
	windowSeconds,
	words = [],
	settings,
}: {
	probabilities: ArrayLike<number>;
	windowSeconds: number;
	words?: readonly TimeRange[];
	settings: AutocutSettings;
}): TimeRange[] {
	const { speech } = settings;
	return [
		...detectSpeechRegions({
			probabilities,
			windowSeconds,
			threshold: speech.threshold,
			minSilenceSeconds: speech.mergeSeconds,
			minSpeechSeconds: speech.minSpeechSeconds,
			speechPadSeconds: 0,
			totalSeconds: probabilities.length * windowSeconds,
		}),
		...words,
	];
}
