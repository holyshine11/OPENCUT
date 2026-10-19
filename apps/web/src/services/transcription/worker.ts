import type { TranscriptionSegment } from "@/transcription/types";
import { loadTranscriptionEngine, type TranscriptionEngine } from "./engine";

// 취소는 service가 worker를 종료하는 방식이라 여기서는 처리하지 않는다
export type WorkerMessage =
	| { type: "init" }
	| {
			type: "transcribe";
			audio: Float32Array;
			language: string;
			terms: string[];
	  };

export type WorkerResponse =
	| { type: "init-progress"; progress: number }
	| { type: "init-complete" }
	| { type: "init-error"; error: string }
	| { type: "transcribe-progress"; progress: number }
	| {
			type: "transcribe-complete";
			text: string;
			segments: TranscriptionSegment[];
	  }
	| { type: "transcribe-error"; error: string };

let engine: TranscriptionEngine | null = null;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	switch (message.type) {
		case "init":
			await handleInit();
			break;
		case "transcribe":
			await handleTranscribe(message);
			break;
	}
};

function reportProgress({
	type,
	fraction,
}: {
	type: "init-progress" | "transcribe-progress";
	fraction: number;
}) {
	const roundedProgress = Math.floor(fraction * 100);
	if (roundedProgress === lastReportedProgress) return;
	lastReportedProgress = roundedProgress;
	self.postMessage({ type, progress: roundedProgress } satisfies WorkerResponse);
}

async function handleInit() {
	lastReportedProgress = -1;
	fileBytes.clear();

	try {
		engine = await loadTranscriptionEngine({
			device: "gpu" in navigator ? "webgpu" : "wasm",
			onProgress: (progressInfo) => {
				const file = progressInfo.file;
				if (!file) return;

				const loaded = progressInfo.loaded ?? 0;
				const total = progressInfo.total ?? 0;

				if (progressInfo.status === "progress" && total > 0) {
					fileBytes.set(file, { loaded, total });
				} else if (progressInfo.status === "done") {
					const existing = fileBytes.get(file);
					if (existing) {
						fileBytes.set(file, {
							loaded: existing.total,
							total: existing.total,
						});
					}
				}

				// sum all bytes
				let totalLoaded = 0;
				let totalSize = 0;
				for (const { loaded, total } of fileBytes.values()) {
					totalLoaded += loaded;
					totalSize += total;
				}

				if (totalSize === 0) return;
				reportProgress({ type: "init-progress", fraction: totalLoaded / totalSize });
			},
		});

		self.postMessage({ type: "init-complete" } satisfies WorkerResponse);
	} catch (error) {
		self.postMessage({
			type: "init-error",
			error: error instanceof Error ? error.message : "Failed to load model",
		} satisfies WorkerResponse);
	}
}

async function handleTranscribe({
	audio,
	language,
	terms,
}: {
	audio: Float32Array;
	language: string;
	terms: string[];
}) {
	if (!engine) {
		self.postMessage({
			type: "transcribe-error",
			error: "Model not initialized",
		} satisfies WorkerResponse);
		return;
	}

	lastReportedProgress = -1;
	try {
		const result = await engine.transcribe({
			audio,
			language,
			terms,
			onProgress: (fraction) =>
				reportProgress({ type: "transcribe-progress", fraction }),
		});
		self.postMessage({
			type: "transcribe-complete",
			text: result.text,
			segments: result.segments,
		} satisfies WorkerResponse);
	} catch (error) {
		self.postMessage({
			type: "transcribe-error",
			error: error instanceof Error ? error.message : "Transcription failed",
		} satisfies WorkerResponse);
	}
}
