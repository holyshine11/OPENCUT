import type {
	TranscriptionLanguage,
	TranscriptionResult,
	TranscriptionProgress,
} from "@/transcription/types";
import { getMessages } from "@/i18n";
import type { WorkerMessage, WorkerResponse } from "./worker";

type ProgressCallback = (progress: TranscriptionProgress) => void;

export const TRANSCRIPTION_CANCELLED_MESSAGE = "Transcription cancelled";

class TranscriptionService {
	private worker: Worker | null = null;
	private initPromise: Promise<void> | null = null;
	private rejectPending: ((error: Error) => void) | null = null;
	private readonly rejectAnalyses = new Set<(error: Error) => void>();

	async transcribe({
		audioData,
		language,
		terms,
		onProgress,
	}: {
		audioData: Float32Array;
		language: TranscriptionLanguage;
		terms: string[];
		onProgress?: ProgressCallback;
	}): Promise<TranscriptionResult> {
		await this.ensureWorker({ onProgress });

		return new Promise((resolve, reject) => {
			const worker = this.worker;
			if (!worker) {
				reject(new Error(getMessages().notices.transcription.failed));
				return;
			}
			this.rejectPending = reject;

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;

				switch (response.type) {
					case "transcribe-progress":
						onProgress?.({
							status: "transcribing",
							progress: response.progress,
						});
						break;

					case "transcribe-complete":
						worker.removeEventListener("message", handleMessage);
						this.rejectPending = null;
						resolve({
							text: response.text,
							segments: response.segments,
							language,
						});
						break;

					case "transcribe-error":
						worker.removeEventListener("message", handleMessage);
						this.rejectPending = null;
						console.error("Transcription failed:", response.error);
						reject(new Error(getMessages().notices.transcription.failed));
						break;
				}
			};

			worker.addEventListener("message", handleMessage);

			worker.postMessage({
				type: "transcribe",
				audio: audioData,
				language,
				terms,
			} satisfies WorkerMessage);
		});
	}

	/** 자동 컷용. VAD 창마다 말소리 확률을 돌려준다. Whisper 모델은 올리지 않는다 */
	analyzeSpeech({
		audioData,
		onProgress,
	}: {
		audioData: Float32Array;
		onProgress?: (percent: number) => void;
	}): Promise<Float32Array> {
		const worker = this.getWorker();
		return new Promise((resolve, reject) => {
			this.rejectAnalyses.add(reject);
			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;
				switch (response.type) {
					case "analyze-speech-progress":
						onProgress?.(response.progress);
						break;
					case "analyze-speech-complete":
						worker.removeEventListener("message", handleMessage);
						this.rejectAnalyses.delete(reject);
						resolve(response.probabilities);
						break;
					case "analyze-speech-error":
						worker.removeEventListener("message", handleMessage);
						this.rejectAnalyses.delete(reject);
						reject(new Error(response.error));
						break;
				}
			};
			worker.addEventListener("message", handleMessage);
			// 복사하지 않고 넘긴다. 20분 영상이면 77MB다
			worker.postMessage({ type: "analyze-speech", audio: audioData } satisfies WorkerMessage, [
				audioData.buffer,
			]);
		});
	}

	/** worker를 종료해서 모델 로딩이나 인식을 즉시 멈춘다. 모델은 브라우저 캐시에 남아 다음에 빨리 다시 올라온다 */
	cancel() {
		const reject = this.rejectPending;
		this.terminate();
		reject?.(new Error(TRANSCRIPTION_CANCELLED_MESSAGE));
	}

	private ensureWorker({
		onProgress,
	}: {
		onProgress?: ProgressCallback;
	}): Promise<void> {
		if (this.initPromise) return this.initPromise;

		const worker = this.getWorker();

		this.initPromise = new Promise((resolve, reject) => {
			this.rejectPending = reject;

			const handleMessage = (event: MessageEvent<WorkerResponse>) => {
				const response = event.data;

				switch (response.type) {
					case "init-progress":
						onProgress?.({
							status: "loading-model",
							progress: response.progress,
						});
						break;

					case "init-complete":
						worker.removeEventListener("message", handleMessage);
						this.rejectPending = null;
						resolve();
						break;

					case "init-error":
						worker.removeEventListener("message", handleMessage);
						this.terminate();
						console.error("Model load failed:", response.error);
						reject(
							new Error(getMessages().notices.transcription.modelLoadFailed),
						);
						break;
				}
			};

			worker.addEventListener("message", handleMessage);
			worker.postMessage({ type: "init" } satisfies WorkerMessage);
		});
		return this.initPromise;
	}

	private getWorker(): Worker {
		this.worker ??= new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});
		return this.worker;
	}

	terminate() {
		// 자막 인식을 취소하면 worker가 죽으므로 기다리던 자동 컷 분석도 끝내 준다
		for (const reject of this.rejectAnalyses) reject(new Error(TRANSCRIPTION_CANCELLED_MESSAGE));
		this.rejectAnalyses.clear();
		this.worker?.terminate();
		this.worker = null;
		this.initPromise = null;
		this.rejectPending = null;
	}
}

export const transcriptionService = new TranscriptionService();
