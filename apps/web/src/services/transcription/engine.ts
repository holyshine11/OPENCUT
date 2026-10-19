import {
	AutoModel,
	AutoProcessor,
	AutoTokenizer,
	Tensor,
	WhisperForConditionalGeneration,
	type PreTrainedModel,
	type PreTrainedTokenizer,
	type Processor,
} from "@huggingface/transformers";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import settings from "@/transcription/settings.json";
import {
	detectSpeechRegions,
	filterHallucinations,
	groupSpeechRegions,
	type TimeRange,
} from "@/transcription/speech-regions";
import type {
	TranscriptionSegment,
	TranscriptionWord,
} from "@/transcription/types";

// 브라우저 worker와 측정 스크립트(bun)가 함께 쓰는 음성 인식 본체.
// VAD로 말하는 구간만 골라 30초 이내로 묶고, 묶음마다 Whisper를 돌려 단어 시간 정보를 받는다.

type Device = "webgpu" | "wasm" | "cpu";
type ProgressInfo = { status?: string; file?: string; loaded?: number; total?: number };

// VAD는 전체 진행률에서 이만큼을 차지한다. 나머지는 Whisper.
const VAD_PROGRESS_SHARE = 0.1;

interface AsrChunk {
	text: string;
	timestamp: [number, number | null];
}

interface WhisperGenerationConfig {
	decoder_start_token_id: number;
	no_timestamps_token_id: number;
	prev_sot_token_id: number;
	lang_to_id: Record<string, number>;
	task_to_id: Record<string, number>;
}

export interface TranscriptionEngine {
	transcribe(args: {
		audio: Float32Array;
		language: string;
		terms: readonly string[];
		onProgress?: (fraction: number) => void;
	}): Promise<{ text: string; segments: TranscriptionSegment[] }>;
}

export async function loadTranscriptionEngine({
	device,
	dtype = settings.model.dtype,
	onProgress,
}: {
	device: Device;
	dtype?: Record<string, string>;
	onProgress?: (info: ProgressInfo) => void;
}): Promise<TranscriptionEngine> {
	const modelId = settings.model.huggingFaceId;
	const [processor, tokenizer, model, vad] = await Promise.all([
		AutoProcessor.from_pretrained(modelId, { progress_callback: onProgress }),
		AutoTokenizer.from_pretrained(modelId, { progress_callback: onProgress }),
		WhisperForConditionalGeneration.from_pretrained(modelId, {
			// transformers.js의 dtype 타입은 리터럴 유니언이라 설정 파일 값을 그대로 넘길 수 없다
			dtype: dtype as never,
			device,
			progress_callback: onProgress,
		}),
		AutoModel.from_pretrained(settings.vad.huggingFaceId, {
			config: { model_type: "custom" } as never,
			dtype: "fp32",
			progress_callback: onProgress,
		}),
	]);

	return {
		transcribe: ({ audio, language, terms, onProgress: onTranscribeProgress }) =>
			transcribe({
				processor,
				tokenizer,
				model,
				vad,
				audio,
				language,
				terms,
				onProgress: onTranscribeProgress,
			}),
	};
}

async function detectSpeech({
	vad,
	audio,
	onProgress,
}: {
	vad: PreTrainedModel;
	audio: Float32Array;
	onProgress?: (fraction: number) => void;
}): Promise<TimeRange[]> {
	const { windowSamples, contextSamples, stateSize } = settings.vad;
	const sampleRate = DEFAULT_TRANSCRIPTION_SAMPLE_RATE;
	const windowCount = Math.ceil(audio.length / windowSamples);
	const probabilities = new Float32Array(windowCount);
	const sr = new Tensor("int64", BigInt64Array.from([BigInt(sampleRate)]), []);
	let state = new Tensor("float32", new Float32Array(2 * stateSize), [2, 1, stateSize]);
	const input = new Float32Array(contextSamples + windowSamples);
	const reportEvery = Math.max(1, Math.floor(windowCount / 100));

	for (let i = 0; i < windowCount; i++) {
		// Silero v5는 창 앞에 직전 64샘플을 붙여서 받는다
		const offset = i * windowSamples;
		input.fill(0);
		const contextStart = Math.max(0, offset - contextSamples);
		input.set(audio.subarray(contextStart, offset), contextSamples - (offset - contextStart));
		input.set(audio.subarray(offset, offset + windowSamples), contextSamples);
		const { output, stateN } = await vad({
			input: new Tensor("float32", input.slice(), [1, input.length]),
			sr,
			state,
		});
		state = stateN;
		probabilities[i] = (output as Tensor).data[0] as number;
		if (i % reportEvery === 0) onProgress?.(i / windowCount);
	}

	return detectSpeechRegions({
		probabilities,
		windowSeconds: windowSamples / sampleRate,
		threshold: settings.vad.threshold,
		minSilenceSeconds: settings.vad.minSilenceSeconds,
		minSpeechSeconds: settings.vad.minSpeechSeconds,
		speechPadSeconds: settings.vad.speechPadSeconds,
		totalSeconds: audio.length / sampleRate,
	});
}

function buildPromptTokens({
	tokenizer,
	config,
	terms,
}: {
	tokenizer: PreTrainedTokenizer;
	config: WhisperGenerationConfig;
	terms: readonly string[];
}): number[] {
	const cleaned = terms.map((term) => term.trim()).filter(Boolean);
	if (cleaned.length === 0) return [];
	const ids = tokenizer.encode(` ${cleaned.join(", ")}`, {
		add_special_tokens: false,
	});
	return [config.prev_sot_token_id, ...ids.slice(-settings.prompt.maxTokens)];
}

async function transcribe({
	processor,
	tokenizer,
	model,
	vad,
	audio,
	language,
	terms,
	onProgress,
}: {
	processor: Processor;
	tokenizer: PreTrainedTokenizer;
	model: PreTrainedModel;
	vad: PreTrainedModel;
	audio: Float32Array;
	language: string;
	terms: readonly string[];
	onProgress?: (fraction: number) => void;
}): Promise<{ text: string; segments: TranscriptionSegment[] }> {
	const sampleRate = DEFAULT_TRANSCRIPTION_SAMPLE_RATE;
	const speechRegions = await detectSpeech({
		vad,
		audio,
		onProgress: (fraction) => onProgress?.(fraction * VAD_PROGRESS_SHARE),
	});
	const groups = groupSpeechRegions({
		regions: speechRegions,
		maxGroupSeconds: settings.vad.maxGroupSeconds,
	});

	const config = model.generation_config as unknown as WhisperGenerationConfig;
	const modelConfig = model.config as unknown as {
		max_source_positions: number;
		max_target_positions: number;
	};
	const featureConfig = (
		processor.feature_extractor as unknown as {
			config: { chunk_length: number; hop_length: number };
		}
	).config;
	const timePrecision = featureConfig.chunk_length / modelConfig.max_source_positions;
	const promptTokens = buildPromptTokens({ tokenizer, config, terms });
	const initTokens = [
		...promptTokens,
		config.decoder_start_token_id,
		config.lang_to_id[`<|${language}|>`],
		config.task_to_id.transcribe,
		config.no_timestamps_token_id,
	];

	const groupWords: TranscriptionWord[][] = [];
	for (const [index, group] of groups.entries()) {
		const slice = audio.subarray(
			Math.floor(group.start * sampleRate),
			Math.ceil(group.end * sampleRate),
		);
		const { input_features } = await processor(slice);
		const output = (await model.generate({
			inputs: input_features,
			decoder_input_ids: initTokens,
			return_token_timestamps: true,
			num_frames: Math.floor(slice.length / featureConfig.hop_length),
			max_new_tokens: modelConfig.max_target_positions - initTokens.length,
		} as never)) as unknown as { sequences: Tensor; token_timestamps: Tensor };

		// 용어 사전 힌트는 출력 앞에 그대로 붙어 나오므로 떼어 낸다
		const tokens = (output.sequences.tolist() as bigint[][])[0].slice(promptTokens.length);
		const tokenTimestamps = (output.token_timestamps.tolist() as number[][])[0].slice(
			promptTokens.length,
		);
		const decodeAsr = (
			tokenizer as unknown as {
				_decode_asr: (
					sequences: unknown[],
					options: Record<string, unknown>,
				) => [string, { chunks?: AsrChunk[] }];
			}
		)._decode_asr.bind(tokenizer);
		const [, { chunks = [] }] = decodeAsr(
			[{ tokens, token_timestamps: tokenTimestamps, stride: [slice.length / sampleRate, 0, 0] }],
			{ return_timestamps: "word", time_precision: timePrecision, force_full_sequences: false },
		);
		groupWords.push(
			chunks.map((chunk) => ({
				text: chunk.text,
				start: group.start + chunk.timestamp[0],
				end: group.start + (chunk.timestamp[1] ?? chunk.timestamp[0]),
			})),
		);
		onProgress?.(VAD_PROGRESS_SHARE + ((index + 1) / groups.length) * (1 - VAD_PROGRESS_SHARE));
	}

	const segments: TranscriptionSegment[] = [];
	for (const [index, words] of groupWords.entries()) {
		const kept = filterHallucinations({
			words,
			speechRegions,
			maxRepeats: settings.filter.maxRepeats,
			maxRepeatNgram: settings.filter.maxRepeatNgram,
			minSpeechOverlap: settings.filter.minSpeechOverlap,
			phrases: settings.filter.hallucinationPhrases,
		});
		const text = kept.map((word) => word.text).join("").trim();
		if (!text) continue;
		segments.push({
			text,
			start: kept[0]?.start ?? groups[index].start,
			end: kept.at(-1)?.end ?? groups[index].end,
			words: kept.map((word) => ({ ...word, text: word.text.trim() })),
		});
	}
	onProgress?.(1);

	return { text: segments.map((segment) => segment.text).join(" "), segments };
}
