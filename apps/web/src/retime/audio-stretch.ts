import { SimpleFilter, SoundTouch } from "soundtouchjs";
import { clampRetimeRate, shouldMaintainPitch } from "@/retime/rate";
import type { RetimeConfig } from "@/timeline";
import { getSourceTimeAtClipTime } from "./resolve";

const RATE_EPSILON = 1e-6;

function sampleLinear({
	channelData,
	position,
}: {
	channelData: Float32Array;
	position: number;
}): number {
	if (position <= 0) {
		return channelData[0] ?? 0;
	}
	const lower = Math.floor(position);
	const upper = Math.min(channelData.length - 1, lower + 1);
	if (lower >= channelData.length) {
		return 0;
	}
	const fraction = position - lower;
	return channelData[lower] * (1 - fraction) + channelData[upper] * fraction;
}

function buildResampledBuffer({
	audioContext,
	sourceBuffer,
	trimStart,
	clipDuration,
	targetSampleRate,
	retime,
}: {
	audioContext: BaseAudioContext;
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	targetSampleRate: number;
	retime?: RetimeConfig;
}): AudioBuffer {
	const outputLength = Math.max(1, Math.ceil(clipDuration * targetSampleRate));
	const numChannels = Math.max(1, Math.min(2, sourceBuffer.numberOfChannels));
	const outputBuffer = audioContext.createBuffer(
		numChannels,
		outputLength,
		targetSampleRate,
	);

	for (let channel = 0; channel < numChannels; channel++) {
		const sourceData = sourceBuffer.getChannelData(
			Math.min(channel, sourceBuffer.numberOfChannels - 1),
		);
		const outputData = outputBuffer.getChannelData(channel);

		for (let i = 0; i < outputLength; i++) {
			const clipTime = i / targetSampleRate;
			const sourceTime =
				trimStart + getSourceTimeAtClipTime({ clipTime, retime });
			outputData[i] = sampleLinear({
				channelData: sourceData,
				position: sourceTime * sourceBuffer.sampleRate,
			});
		}
	}

	return outputBuffer;
}

async function buildPitchPreservedBuffer({
	sourceBuffer,
	trimStart,
	clipDuration,
	rate,
	targetSampleRate,
}: {
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	rate: number;
	targetSampleRate: number;
}): Promise<AudioBuffer> {
	const nativeSampleRate = sourceBuffer.sampleRate;
	const sourceDuration = clipDuration * rate;
	const startSample = Math.max(0, Math.floor(trimStart * nativeSampleRate));
	const numSourceSamples = Math.max(
		1,
		Math.ceil(sourceDuration * nativeSampleRate),
	);
	const available = Math.max(0, sourceBuffer.length - startSample);
	const actualSamples = Math.max(1, Math.min(numSourceSamples, available));
	const numChannels = Math.max(1, Math.min(2, sourceBuffer.numberOfChannels));

	// Resample to targetSampleRate first — soundtouchjs reads raw channel data
	// and does not respect the source buffer's native sample rate.
	const resampledLength = Math.max(
		1,
		Math.ceil(sourceDuration * targetSampleRate),
	);
	const resampleCtx = new OfflineAudioContext(
		numChannels,
		resampledLength,
		targetSampleRate,
	);
	const nativeBuffer = resampleCtx.createBuffer(
		numChannels,
		actualSamples,
		nativeSampleRate,
	);

	for (let ch = 0; ch < numChannels; ch++) {
		const src = sourceBuffer.getChannelData(
			Math.min(ch, sourceBuffer.numberOfChannels - 1),
		);
		nativeBuffer.copyToChannel(
			src.subarray(startSample, startSample + actualSamples),
			ch,
		);
	}

	const resampleSourceNode = resampleCtx.createBufferSource();
	resampleSourceNode.buffer = nativeBuffer;
	resampleSourceNode.connect(resampleCtx.destination);
	resampleSourceNode.start(0);
	const resampledBuffer = await resampleCtx.startRendering();

	const outputSamples = Math.max(
		1,
		Math.ceil(clipDuration * targetSampleRate),
	);
	const stretched = stretchKeepingPitch({
		channels: Array.from({ length: numChannels }, (_, ch) =>
			resampledBuffer.getChannelData(ch),
		),
		rate,
		sampleRate: targetSampleRate,
		length: outputSamples,
	});
	const output = new AudioBuffer({
		numberOfChannels: numChannels,
		length: outputSamples,
		sampleRate: targetSampleRate,
	});
	stretched.forEach((data, ch) => output.copyToChannel(data, ch));
	return output;
}

// soundtouch는 남은 입력이 16384프레임 미만이면 처리하지 않으니, 뒤에 무음을 붙여 끝소리까지 밀어낸다
const FLUSH_PAD_SECONDS = 1;
const CHUNK_FRAMES = 4096;

/**
 * 음높이를 지키며 rate배 빠르게 한다. ScriptProcessor(PitchShifter)를 거치면
 * 출력이 버퍼 하나만큼 밀리고 끝이 잘려서, soundtouch에서 직접 뽑는다
 */
export function stretchKeepingPitch({
	channels,
	rate,
	sampleRate,
	length,
}: {
	channels: Float32Array[];
	rate: number;
	sampleRate: number;
	length: number;
}): Float32Array<ArrayBuffer>[] {
	const left = channels[0];
	const right = channels[1] ?? left;
	const end = left.length + Math.ceil(FLUSH_PAD_SECONDS * sampleRate);
	const source = {
		// soundtouch가 부르는 모양이라 위치 인자를 그대로 받는다
		// eslint-disable-next-line opencut/prefer-object-params
		extract(target: Float32Array, numFrames: number, position: number) {
			const frames = Math.max(0, Math.min(numFrames, end - position));
			for (let i = 0; i < frames; i++) {
				target[i * 2] = left[position + i] ?? 0;
				target[i * 2 + 1] = right[position + i] ?? 0;
			}
			return frames;
		},
	};
	const soundtouch = new SoundTouch();
	soundtouch.tempo = rate;
	const filter = new SimpleFilter(source, soundtouch);
	const output = channels.map(() => new Float32Array(length));
	const chunk = new Float32Array(CHUNK_FRAMES * 2);
	let written = 0;
	while (written < length) {
		const frames = filter.extract(
			chunk,
			Math.min(CHUNK_FRAMES, length - written),
		);
		if (frames === 0) break;
		for (let i = 0; i < frames; i++) {
			output[0][written + i] = chunk[i * 2];
			if (output[1]) output[1][written + i] = chunk[i * 2 + 1];
		}
		written += frames;
	}
	return output;
}

export async function renderRetimedBuffer({
	audioContext,
	sourceBuffer,
	trimStart,
	clipDuration,
	retime,
	maintainPitch = false,
}: {
	audioContext: BaseAudioContext;
	sourceBuffer: AudioBuffer;
	trimStart: number;
	clipDuration: number;
	retime?: RetimeConfig;
	maintainPitch?: boolean;
}): Promise<AudioBuffer> {
	const targetSampleRate = audioContext.sampleRate;
	const rate = clampRetimeRate({ rate: retime?.rate ?? 1 });
	const usePitchPreservation =
		shouldMaintainPitch({ rate, maintainPitch }) &&
		Math.abs(rate - 1) > RATE_EPSILON;

	if (usePitchPreservation) {
		return buildPitchPreservedBuffer({
			sourceBuffer,
			trimStart,
			clipDuration,
			rate,
			targetSampleRate,
		});
	}

	return buildResampledBuffer({
		audioContext,
		sourceBuffer,
		trimStart,
		clipDuration,
		targetSampleRate,
		retime,
	});
}
