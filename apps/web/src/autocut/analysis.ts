"use client";

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { createAudioContext, resolveAudioBufferForAsset } from "@/media/audio";
import type { MediaAsset } from "@/media/types";
import { transcriptionService } from "@/services/transcription/service";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import transcriptionSettings from "@/transcription/settings.json";
import settings from "./settings.json";
import { frameDifference } from "./edit-points";

/** 소스 하나의 VAD 창별 말소리 확률 */
export interface SpeechAnalysis {
	probabilities: Float32Array;
	windowSeconds: number;
}

// ponytail: 메모리 캐시라 새로고침하면 다시 분석한다. 10분 영상에 수십 초 이상 걸리면 IndexedDB에 저장한다
const cache = new Map<string, Promise<SpeechAnalysis>>();

export function getSpeechAnalysis({
	asset,
	onProgress,
}: {
	asset: MediaAsset;
	onProgress?: (percent: number) => void;
}): Promise<SpeechAnalysis> {
	const existing = cache.get(asset.id);
	if (existing) return existing;
	const promise = analyze({ asset, onProgress }).catch((error) => {
		cache.delete(asset.id);
		throw error;
	});
	cache.set(asset.id, promise);
	return promise;
}

async function analyze({
	asset,
	onProgress,
}: {
	asset: MediaAsset;
	onProgress?: (percent: number) => void;
}): Promise<SpeechAnalysis> {
	const sampleRate = DEFAULT_TRANSCRIPTION_SAMPLE_RATE;
	const audioContext = createAudioContext({ sampleRate });
	let buffer: AudioBuffer | null;
	try {
		buffer = await resolveAudioBufferForAsset({ asset, audioContext });
	} finally {
		void audioContext.close();
	}
	if (!buffer) throw new Error(`No audio in ${asset.name}`);

	const audio = new Float32Array(buffer.length);
	for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
		const data = buffer.getChannelData(channel);
		for (let i = 0; i < audio.length; i++) audio[i] += data[i] / buffer.numberOfChannels;
	}

	const windowSamples = transcriptionSettings.vad.windowSamples;
	const probabilities = await transcriptionService.analyzeSpeech({
		audioData: audio,
		onProgress,
	});
	return { probabilities, windowSeconds: windowSamples / sampleRate };
}

/** 소스 하나의 화면 움직임. `motion[i]`는 i번째와 i+1번째 샘플 프레임의 밝기 차이 */
export interface MotionAnalysis {
	motion: Float32Array;
	motionSeconds: number;
}

const motionCache = new Map<string, Promise<MotionAnalysis>>();

export function getMotionAnalysis({
	asset,
	onProgress,
}: {
	asset: MediaAsset;
	onProgress?: (percent: number) => void;
}): Promise<MotionAnalysis> {
	const existing = motionCache.get(asset.id);
	if (existing) return existing;
	const promise = analyzeMotion({ asset, onProgress }).catch((error) => {
		motionCache.delete(asset.id);
		throw error;
	});
	motionCache.set(asset.id, promise);
	return promise;
}

/** 초당 `sampleFps`장을 가로 `width`px로 줄여 디코딩하고 앞 장과의 밝기 차이를 잰다 */
async function analyzeMotion({
	asset,
	onProgress,
}: {
	asset: MediaAsset;
	onProgress?: (percent: number) => void;
}): Promise<MotionAnalysis> {
	const { sampleFps, width } = settings.motion;
	const input = new Input({ source: new BlobSource(asset.file), formats: ALL_FORMATS });
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track || !(await track.canDecode())) throw new Error(`Cannot decode video in ${asset.name}`);
		const start = await track.getFirstTimestamp();
		const count = Math.floor(((await track.computeDuration()) - start) * sampleFps) + 1;
		const timestamps = Array.from({ length: count }, (_, i) => start + i / sampleFps);
		const sink = new CanvasSink(track, { width, poolSize: 1 });

		const motion = new Float32Array(Math.max(0, count - 1));
		let previous: Uint8ClampedArray | null = null;
		let index = 0;
		for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
			// 디코딩 못 한 프레임은 앞 프레임과 같다고 본다
			let pixels: Uint8ClampedArray | null = previous;
			if (wrapped) {
				const { canvas } = wrapped;
				const context =
					canvas instanceof OffscreenCanvas ? canvas.getContext("2d") : canvas.getContext("2d");
				if (context) pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
			}
			if (previous && pixels) motion[index - 1] = frameDifference({ previous, next: pixels });
			previous = pixels;
			index++;
			onProgress?.(Math.round((index / count) * 100));
		}
		return { motion, motionSeconds: 1 / sampleFps };
	} finally {
		input.dispose();
	}
}
