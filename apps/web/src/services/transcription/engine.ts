import {
	AutoModel,
	AutoProcessor,
	AutoTokenizer,
	env,
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
	findMissedRegions,
	groupSpeechRegions,
	joinedLength,
	joinRegions,
	toOriginalRange,
	type JoinedRegion,
	type TimeRange,
} from "@/transcription/speech-regions";
import type {
	TranscriptionSegment,
	TranscriptionWord,
} from "@/transcription/types";

// 브라우저 worker와 측정 스크립트(bun)가 함께 쓰는 음성 인식 본체.
// VAD로 말하는 구간만 골라 무음을 줄여 이어 붙이고 30초 이내로 묶어, 묶음마다 Whisper를 돌려 단어 시간 정보를 받는다.

// 모델은 앱 폴더(public/)에서만 읽는다. 인터넷 없이 돌아가야 하므로 Hugging Face는 쓰지 않고,
// 파일은 `bun run models`(scripts/fetch-models.ts)로 미리 받아 둔다.
// 브라우저 worker는 worker.ts에서 origin을 붙인 절대 경로로, bun 스크립트는 import 뒤에 파일 경로로 바꿔 쓴다
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = settings.local.modelPath;

type Device = "webgpu" | "wasm" | "cpu";
type ProgressInfo = { status?: string; file?: string; loaded?: number; total?: number };

// VAD는 전체 진행률에서 이만큼을 차지한다. 나머지는 Whisper.
const VAD_PROGRESS_SHARE = 0.1;
// 빠진 말을 다시 듣는 단계의 몫
const REFILL_PROGRESS_SHARE = 0.1;

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
		loadVadModel({ onProgress }),
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

/** Silero VAD만 올린다. 자동 컷은 Whisper 없이 이것만 쓴다 */
export function loadVadModel({
	onProgress,
}: {
	onProgress?: (info: ProgressInfo) => void;
} = {}): Promise<PreTrainedModel> {
	return AutoModel.from_pretrained(settings.vad.huggingFaceId, {
		config: { model_type: "custom" } as never,
		dtype: settings.vad.dtype as never,
		progress_callback: onProgress,
	});
}

/** VAD 창(`settings.vad.windowSamples`)마다 말소리 확률을 구한다 */
export async function computeSpeechProbabilities({
	vad,
	audio,
	onProgress,
}: {
	vad: PreTrainedModel;
	audio: Float32Array;
	onProgress?: (fraction: number) => void;
}): Promise<Float32Array> {
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
	return probabilities;
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
	const { windowSamples } = settings.vad;
	const sampleRate = DEFAULT_TRANSCRIPTION_SAMPLE_RATE;
	const probabilities = await computeSpeechProbabilities({ vad, audio, onProgress });
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

/** 묶음의 구간들만 `joined` 배치대로 이어 붙인다. 줄인 무음 자리는 0으로 둔다 */
function joinAudio({
	audio,
	joined,
}: {
	audio: Float32Array;
	joined: readonly JoinedRegion[];
}): Float32Array {
	const sampleRate = DEFAULT_TRANSCRIPTION_SAMPLE_RATE;
	const result = new Float32Array(Math.ceil(joinedLength({ joined }) * sampleRate));
	for (const region of joined) {
		const offset = Math.floor(region.at * sampleRate);
		const from = Math.floor(region.start * sampleRate);
		const length = Math.min(Math.round((region.end - region.start) * sampleRate), result.length - offset);
		result.set(audio.subarray(from, from + length), offset);
	}
	return result;
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
		joinSeconds: settings.vad.joinSeconds,
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

	const transcribeGroup = async (group: TimeRange[]): Promise<TranscriptionWord[]> => {
		const joined = joinRegions({ regions: group, joinSeconds: settings.vad.joinSeconds });
		const slice = joinAudio({ audio, joined });
		const { input_features } = await processor(slice);
		const output = (await model.generate({
			inputs: input_features,
			decoder_input_ids: initTokens,
			return_token_timestamps: true,
			// 교차 어텐션은 인코더 위치(멜 프레임의 절반) 단위다. 멜 프레임 수를 그대로 주면 30초 패딩까지 정렬해 단어 시간이 무음 끝으로 몰린다
			num_frames: Math.floor(slice.length / featureConfig.hop_length / 2),
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
		return filterHallucinations({
			words: chunks.map((chunk) => ({
				text: chunk.text,
				...toOriginalRange({
					joined,
					start: chunk.timestamp[0],
					end: chunk.timestamp[1] ?? chunk.timestamp[0],
				}),
			})),
			speechRegions,
			maxRepeats: settings.filter.maxRepeats,
			maxRepeatNgram: settings.filter.maxRepeatNgram,
			minSpeechOverlap: settings.filter.minSpeechOverlap,
			phrases: settings.filter.hallucinationPhrases,
		});
	};

	const groupWords: TranscriptionWord[][] = [];
	for (const [index, group] of groups.entries()) {
		groupWords.push(await transcribeGroup(group));
		onProgress?.(VAD_PROGRESS_SHARE + ((index + 1) / groups.length) * (1 - VAD_PROGRESS_SHARE - REFILL_PROGRESS_SHARE));
	}

	// Whisper는 묶음 앞뒤나 반복에 빠진 뒤의 말을 통째로 빼먹곤 한다. 단어가 하나도 없는 긴 말소리만 모아 한 번 더 듣는다
	const refillGroups = groupSpeechRegions({
		regions: findMissedRegions({
			regions: speechRegions,
			words: groupWords.flat(),
			minSeconds: settings.vad.refillMinSeconds,
		}),
		maxGroupSeconds: settings.vad.maxGroupSeconds,
		joinSeconds: settings.vad.joinSeconds,
	});
	for (const [index, group] of refillGroups.entries()) {
		groupWords.push(await transcribeGroup(group));
		onProgress?.(1 - REFILL_PROGRESS_SHARE + ((index + 1) / refillGroups.length) * REFILL_PROGRESS_SHARE);
	}

	const segments: TranscriptionSegment[] = [];
	for (const words of groupWords) {
		const text = words.map((word) => word.text).join("").trim();
		const first = words[0];
		const last = words.at(-1);
		if (!text || !first || !last) continue;
		segments.push({
			text,
			start: first.start,
			end: last.end,
			words: words.map((word) => ({ ...word, text: word.text.trim() })),
		});
	}
	segments.sort((a, b) => a.start - b.start);
	onProgress?.(1);

	return { text: segments.map((segment) => segment.text).join(" "), segments };
}
