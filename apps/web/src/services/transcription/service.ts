import type {
	TranscriptionLanguage,
	TranscriptionResult,
	TranscriptionProgress,
} from "@/transcription/types";
import type { WorkerMessage, WorkerResponse } from "./worker";

type ProgressCallback = (progress: TranscriptionProgress) => void;

export const TRANSCRIPTION_CANCELLED_MESSAGE = "Transcription cancelled";

class TranscriptionService {
	private worker: Worker | null = null;
	private initPromise: Promise<void> | null = null;
	private rejectPending: ((error: Error) => void) | null = null;

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
				reject(new Error("Worker not initialized"));
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
						reject(new Error(response.error));
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

		const worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});
		this.worker = worker;

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
						reject(new Error(response.error));
						break;
				}
			};

			worker.addEventListener("message", handleMessage);
			worker.postMessage({ type: "init" } satisfies WorkerMessage);
		});
		return this.initPromise;
	}

	terminate() {
		this.worker?.terminate();
		this.worker = null;
		this.initPromise = null;
		this.rejectPending = null;
	}
}

export const transcriptionService = new TranscriptionService();
