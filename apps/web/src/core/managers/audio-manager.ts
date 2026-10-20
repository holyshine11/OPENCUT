import type { EditorCore } from "@/core";
import { TICKS_PER_SECOND } from "@/wasm";
import { clampRetimeRate, shouldMaintainPitch } from "@/retime/rate";
import type { AudioClipSource } from "@/media/audio";
import { createAudioContext, collectAudioClips } from "@/media/audio";
import {
	buildAudioGainAutomation,
	hasGainAutomation,
} from "@/timeline/audio-state";
import { createAudioMasteringChain } from "@/media/audio-mastering";
import { connectAudioEffects, getAudioEffects } from "@/media/audio-effects";
import {
	faderDbToGain,
	getTrackGain,
	getTrackPan,
	isTrackSilencedBySolo,
} from "@/timeline/audio-mix";
import {
	averageLufs,
	integratedLufs,
	K_WEIGHTING,
	LOUDNESS_BLOCK_SECONDS,
	LOUDNESS_HOP_SECONDS,
	meanSquareTail,
	powerToLufs,
	SHORT_TERM_SECONDS,
} from "@/media/loudness";
import { canTrackHaveAudio } from "@/timeline";
import {
	getClipTimeAtSourceTime,
	getSourceTimeAtClipTime,
	renderRetimedBuffer,
} from "@/retime";
import {
	ALL_FORMATS,
	AudioBufferSink,
	BlobSource,
	Input,
	InputDisposedError,
	type WrappedAudioBuffer,
} from "mediabunny";

// disposeSinks() disposes inputs mid-read when the timeline changes; that rejection is expected
function ignoreInputDisposed(error: unknown): void {
	if (error instanceof InputDisposedError) return;
	console.warn("Audio clip iterator failed:", error);
}

const METER_FFT_SIZE = 2048;
// 분석기 최대 창. 400ms 블록을 담기에 충분하다(96kHz면 약 341ms로 잘린다)
const LOUDNESS_FFT_SIZE = 32768;
const SHORT_TERM_BLOCKS = Math.round(SHORT_TERM_SECONDS / LOUDNESS_HOP_SECONDS);

interface TrackBus {
	input: GainNode;
	panner: StereoPannerNode;
	analyser: AnalyserNode;
}

/** 미터 한 칸의 피크 진폭(선형, 0~). 1을 넘으면 리미터 앞에서 0 dBFS를 넘은 것 */
export interface AudioLevels {
	left: number;
	right: number;
}

/** LUFS. 측정값이 없으면 -Infinity */
export interface AudioLoudness {
	momentary: number;
	shortTerm: number;
	integrated: number;
}

export class AudioManager {
	private audioContext: AudioContext | null = null;
	private masterGain: GainNode | null = null;
	/** 트랙 버스가 모이는 곳. 마스터 페이더 → 모노 합산 → 미터 → 모니터 볼륨·리미터 */
	private masterBus: GainNode | null = null;
	private monoNode: GainNode | null = null;
	private meterAnalysers: [AnalyserNode, AnalyserNode] | null = null;
	private trackBuses = new Map<string, TrackBus>();
	private elementTrackIds = new Map<string, string>();
	private meterScratch = new Float32Array(METER_FFT_SIZE);
	private soloSilencedTrackIds = new Set<string>();
	private loudnessAnalysers: [AnalyserNode, AnalyserNode] | null = null;
	private loudnessScratch = new Float32Array(LOUDNESS_FFT_SIZE);
	private loudnessTimer: number | null = null;
	/** 100ms마다 잰 400ms 블록 파워. 통합 라우드니스는 초기화 전까지 누적한다 */
	private loudnessBlocks: number[] = [];
	private playbackStartTime = 0;
	private playbackStartContextTime = 0;
	private scheduleTimer: number | null = null;
	private lookaheadSeconds = 2;
	private scheduleIntervalMs = 500;
	private clips: AudioClipSource[] = [];
	private sinks = new Map<string, AudioBufferSink>();
	private inputs = new Map<string, Input>();
	private activeClipIds = new Set<string>();
	private clipIterators = new Map<
		string,
		AsyncGenerator<WrappedAudioBuffer, void, unknown>
	>();
	private queuedSources = new Set<AudioBufferSourceNode>();
	/** 클립별 이펙트 체인 입력. 청크가 바뀌어도 꼬리가 이어지도록 재생 세션 동안 유지한다 */
	private clipEffectChains = new Map<string, AudioNode[]>();
	private preparedClipBuffers = new Map<string, Promise<AudioBuffer | null>>();
	private decodedBuffers = new Map<string, Promise<AudioBuffer | null>>();
	private playbackSessionId = 0;
	private lastIsPlaying = false;
	private lastVolume = 1;
	private playbackLatencyCompensationSeconds = 0;
	private unsubscribers: Array<() => void> = [];

	constructor(private editor: EditorCore) {
		this.lastVolume = this.editor.playback.getVolume();

		this.unsubscribers.push(
			this.editor.playback.subscribe(this.handlePlaybackChange),
			this.editor.timeline.subscribe(this.handleTimelineChange),
			this.editor.media.subscribe(this.handleTimelineChange),
			this.editor.project.subscribe(this.applyMasterSettings),
			this.editor.playback.onSeek(this.handleSeek),
		);
	}

	dispose(): void {
		this.stopPlayback();
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		this.disposeSinks();
		this.preparedClipBuffers.clear();
		this.decodedBuffers.clear();
		if (this.audioContext) {
			void this.audioContext.close();
			this.audioContext = null;
			this.masterGain = null;
			this.masterBus = null;
			this.monoNode = null;
			this.meterAnalysers = null;
			this.loudnessAnalysers = null;
			this.trackBuses.clear();
		}
	}

	private handlePlaybackChange = (): void => {
		const isPlaying = this.editor.playback.getIsPlaying();
		const volume = this.editor.playback.getVolume();

		if (volume !== this.lastVolume) {
			this.lastVolume = volume;
			this.updateGain();
		}

		if (isPlaying !== this.lastIsPlaying) {
			this.lastIsPlaying = isPlaying;
			if (isPlaying) {
				void this.startPlayback({
					time: this.editor.playback.getCurrentTime() / TICKS_PER_SECOND,
				});
			} else {
				this.stopPlayback();
			}
		}
	};

	private handleSeek = (time: number): void => {
		if (this.editor.playback.getIsScrubbing()) {
			this.stopPlayback();
			return;
		}

		if (this.editor.playback.getIsPlaying()) {
			void this.startPlayback({ time: time / TICKS_PER_SECOND });
			return;
		}

		this.stopPlayback();
	};

	private handleTimelineChange = (): void => {
		this.applyTrackMix();
		this.disposeSinks();
		this.preparedClipBuffers.clear();
		this.decodedBuffers.clear();

		if (!this.editor.playback.getIsPlaying()) return;

		void this.startPlayback({
			time: this.editor.playback.getCurrentTime() / TICKS_PER_SECOND,
		});
	};

	private ensureAudioContext(): AudioContext | null {
		if (this.audioContext) return this.audioContext;
		if (typeof window === "undefined") return null;

		this.audioContext = createAudioContext();
		const { input } = createAudioMasteringChain({
			audioContext: this.audioContext,
			destination: this.audioContext.destination,
		});
		this.masterGain = input;
		this.masterGain.gain.value = this.lastVolume;

		this.masterBus = this.audioContext.createGain();
		// channelCount 1 + explicit 이면 스테레오가 (L+R)/2 로 합쳐지고, 뒤 노드에서 양쪽으로 다시 퍼진다
		this.monoNode = this.audioContext.createGain();
		this.monoNode.channelCountMode = "explicit";
		this.monoNode.channelInterpretation = "speakers";
		const splitter = this.audioContext.createChannelSplitter(2);
		const left = this.audioContext.createAnalyser();
		const right = this.audioContext.createAnalyser();
		left.fftSize = METER_FFT_SIZE;
		right.fftSize = METER_FFT_SIZE;
		this.meterAnalysers = [left, right];

		this.masterBus.connect(this.monoNode);
		this.monoNode.connect(this.masterGain);
		this.monoNode.connect(splitter);
		splitter.connect(left, 0);
		splitter.connect(right, 1);

		// 라우드니스는 K-가중을 거친 좌우 채널로 잰다
		const shelf = this.audioContext.createBiquadFilter();
		shelf.type = "highshelf";
		shelf.frequency.value = K_WEIGHTING.shelf.frequency;
		shelf.gain.value = K_WEIGHTING.shelf.gainDb;
		const highpass = this.audioContext.createBiquadFilter();
		highpass.type = "highpass";
		highpass.frequency.value = K_WEIGHTING.highpass.frequency;
		highpass.Q.value = K_WEIGHTING.highpass.qDb;
		const loudnessSplitter = this.audioContext.createChannelSplitter(2);
		const loudnessLeft = this.audioContext.createAnalyser();
		const loudnessRight = this.audioContext.createAnalyser();
		loudnessLeft.fftSize = LOUDNESS_FFT_SIZE;
		loudnessRight.fftSize = LOUDNESS_FFT_SIZE;
		this.loudnessAnalysers = [loudnessLeft, loudnessRight];
		this.monoNode.connect(shelf);
		shelf.connect(highpass);
		highpass.connect(loudnessSplitter);
		loudnessSplitter.connect(loudnessLeft, 0);
		loudnessSplitter.connect(loudnessRight, 1);

		this.applyMasterSettings();
		this.applyTrackMix();
		return this.audioContext;
	}

	private applyMasterSettings = (): void => {
		if (!this.masterBus || !this.monoNode) return;
		const settings = this.editor.project.getActiveOrNull()?.settings;
		this.masterBus.gain.value = faderDbToGain(settings?.masterVolume ?? 0);
		this.monoNode.channelCount = settings?.audioMono ? 1 : 2;
	};

	/** 페이더를 끄는 동안 저장 없이 바로 들리게 한다. 놓을 때 명령으로 저장한다 */
	previewMasterVolume({ volumeDb }: { volumeDb: number }): void {
		if (this.masterBus) this.masterBus.gain.value = faderDbToGain(volumeDb);
	}

	previewTrackMix({
		trackId,
		volumeDb,
		pan,
	}: {
		trackId: string;
		volumeDb?: number;
		pan?: number;
	}): void {
		const bus = this.trackBuses.get(trackId);
		if (!bus) return;
		if (volumeDb !== undefined && !this.soloSilencedTrackIds.has(trackId))
			bus.input.gain.value = faderDbToGain(volumeDb);
		if (pan !== undefined) bus.panner.pan.value = pan;
	}

	private applyTrackMix(): void {
		if (!this.audioContext) return;
		const tracks = this.editor.scenes.getActiveSceneOrNull()?.tracks ?? [];
		this.elementTrackIds.clear();
		this.soloSilencedTrackIds.clear();
		for (const track of tracks) {
			if (!canTrackHaveAudio(track)) continue;
			const bus = this.ensureTrackBus(track.id);
			const isSilenced = isTrackSilencedBySolo({ track, tracks });
			if (isSilenced) this.soloSilencedTrackIds.add(track.id);
			bus.input.gain.value = isSilenced ? 0 : getTrackGain(track);
			bus.panner.pan.value = getTrackPan(track);
			for (const element of track.elements) {
				this.elementTrackIds.set(element.id, track.id);
			}
		}
	}

	private ensureTrackBus(trackId: string): TrackBus {
		const existing = this.trackBuses.get(trackId);
		if (existing) return existing;
		const context = this.audioContext;
		if (!context) throw new Error("Audio context is not ready.");
		const input = context.createGain();
		const panner = context.createStereoPanner();
		const analyser = context.createAnalyser();
		analyser.fftSize = METER_FFT_SIZE;
		input.connect(panner);
		panner.connect(analyser);
		panner.connect(this.masterBus ?? context.destination);
		const bus = { input, panner, analyser };
		this.trackBuses.set(trackId, bus);
		return bus;
	}

	private getClipDestination({
		clip,
		audioContext,
	}: {
		clip: AudioClipSource;
		audioContext: AudioContext;
	}): AudioNode {
		const trackId = this.elementTrackIds.get(clip.id);
		const bus = trackId ? this.trackBuses.get(trackId) : undefined;
		const destination = bus?.input ?? this.masterBus ?? audioContext.destination;
		const existing = this.clipEffectChains.get(clip.id);
		if (existing) return existing[0];
		const settings = getAudioEffects({ element: clip.timelineElement });
		if (!settings) return destination;
		const input = audioContext.createGain();
		const nodes = connectAudioEffects({
			context: audioContext,
			input,
			output: destination,
			settings,
		});
		this.clipEffectChains.set(clip.id, [input, ...nodes]);
		return input;
	}

	private readPeak(analyser: AnalyserNode): number {
		analyser.getFloatTimeDomainData(this.meterScratch);
		let peak = 0;
		for (const sample of this.meterScratch) {
			const magnitude = Math.abs(sample);
			if (magnitude > peak) peak = magnitude;
		}
		return peak;
	}

	/** 마스터 출력(리미터 앞) 좌우 피크. 재생 중이 아니면 0 */
	getMasterLevels(): AudioLevels {
		if (!this.meterAnalysers || !this.editor.playback.getIsPlaying()) {
			return { left: 0, right: 0 };
		}
		return {
			left: this.readPeak(this.meterAnalysers[0]),
			right: this.readPeak(this.meterAnalysers[1]),
		};
	}

	/** 트랙 페이더·팬을 지난 피크(모노 합산) */
	getTrackLevel({ trackId }: { trackId: string }): number {
		const bus = this.trackBuses.get(trackId);
		if (!bus || !this.editor.playback.getIsPlaying()) return 0;
		return this.readPeak(bus.analyser);
	}

	private measureLoudnessBlock = (): void => {
		if (!this.loudnessAnalysers || !this.audioContext) return;
		const blockSamples = Math.round(
			LOUDNESS_BLOCK_SECONDS * this.audioContext.sampleRate,
		);
		let power = 0;
		for (const analyser of this.loudnessAnalysers) {
			analyser.getFloatTimeDomainData(this.loudnessScratch);
			power += meanSquareTail({
				samples: this.loudnessScratch,
				count: blockSamples,
			});
		}
		this.loudnessBlocks.push(power);
	};

	/** 모멘터리(400ms)·숏텀(3s)·통합 LUFS. 마스터 버스(리미터 앞)에서 잰다 */
	getLoudness(): AudioLoudness {
		const blocks = this.loudnessBlocks;
		const isPlaying = this.editor.playback.getIsPlaying();
		return {
			momentary:
				isPlaying && blocks.length > 0
					? powerToLufs(blocks[blocks.length - 1])
					: Number.NEGATIVE_INFINITY,
			shortTerm: isPlaying
				? averageLufs(blocks.slice(-SHORT_TERM_BLOCKS))
				: Number.NEGATIVE_INFINITY,
			integrated: integratedLufs(blocks),
		};
	}

	resetLoudness(): void {
		this.loudnessBlocks = [];
	}

	private updateGain(): void {
		if (!this.masterGain) return;
		this.masterGain.gain.value = this.lastVolume;
	}

	private getPlaybackTime(): number {
		if (!this.audioContext) return this.playbackStartTime;
		const elapsed =
			this.audioContext.currentTime - this.playbackStartContextTime;
		return this.playbackStartTime + elapsed;
	}

	private async startPlayback({ time }: { time: number }): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		this.stopPlayback();
		this.playbackSessionId++;
		this.playbackLatencyCompensationSeconds = 0;

		const tracks = this.editor.scenes.getActiveScene().tracks;
		const mediaAssets = this.editor.media.getAssets();
		const duration = this.editor.timeline.getTotalDuration();

		if (duration <= 0) return;

		if (audioContext.state === "suspended") {
			await audioContext.resume();
		}

		this.clips = await collectAudioClips({ tracks, mediaAssets });
		if (!this.editor.playback.getIsPlaying()) return;

		this.playbackStartTime = time;
		this.playbackStartContextTime = audioContext.currentTime;

		this.scheduleUpcomingClips();

		if (typeof window !== "undefined") {
			this.scheduleTimer = window.setInterval(() => {
				this.scheduleUpcomingClips();
			}, this.scheduleIntervalMs);
			// ponytail: 메인 스레드 타이머라 블록 간격이 조금 흔들린다. 정밀 측정이 필요하면 AudioWorklet으로
			this.loudnessTimer = window.setInterval(
				this.measureLoudnessBlock,
				LOUDNESS_HOP_SECONDS * 1000,
			);
		}
	}

	private scheduleUpcomingClips(): void {
		if (!this.editor.playback.getIsPlaying()) return;

		const currentTime = this.getPlaybackTime();
		const windowEnd = currentTime + this.lookaheadSeconds;

		for (const clip of this.clips) {
			if (clip.muted) continue;
			if (this.activeClipIds.has(clip.id)) continue;

			const clipEnd = clip.startTime + clip.duration;
			if (clipEnd <= currentTime) continue;
			if (clip.startTime > windowEnd) continue;

			this.activeClipIds.add(clip.id);
			if (this.shouldUsePreparedClipBuffer({ clip })) {
				void this.schedulePreparedClip({
					clip,
					startTime: currentTime,
					sessionId: this.playbackSessionId,
				});
			} else {
				this.runClipIterator({
					clip,
					startTime: currentTime,
					sessionId: this.playbackSessionId,
				}).catch(ignoreInputDisposed);
			}
		}
	}

	private stopPlayback(): void {
		if (this.scheduleTimer && typeof window !== "undefined") {
			window.clearInterval(this.scheduleTimer);
		}
		this.scheduleTimer = null;
		if (this.loudnessTimer !== null && typeof window !== "undefined") {
			window.clearInterval(this.loudnessTimer);
		}
		this.loudnessTimer = null;

		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const source of this.queuedSources) {
			try {
				source.stop();
			} catch {
				// 아직 start하지 않았거나 이미 멈춘 소스는 stop()이 던진다. 정리 중이라 무시한다
			}
			source.disconnect();
		}
		this.queuedSources.clear();

		for (const nodes of this.clipEffectChains.values()) {
			for (const node of nodes) node.disconnect();
		}
		this.clipEffectChains.clear();
	}

	private async runClipIterator({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		const sink = await this.getAudioSink({ clip });
		if (!sink || !this.editor.playback.getIsPlaying()) return;
		if (sessionId !== this.playbackSessionId) return;

		const clipStart = clip.startTime;
		const clipEnd = clip.startTime + clip.duration;
		const playbackTimeAfterSinkReady = this.getPlaybackTime();
		const iteratorStartTime = Math.max(
			startTime,
			clipStart,
			playbackTimeAfterSinkReady,
		);
		if (iteratorStartTime >= clipEnd) {
			return;
		}
		const sourceStartTime =
			clip.trimStart +
			getSourceTimeAtClipTime({
				clipTime: iteratorStartTime - clip.startTime,
				retime: clip.retime,
			});

		const iterator = sink.buffers(sourceStartTime);
		this.clipIterators.set(clip.id, iterator);
		let consecutiveDroppedBufferCount = 0;

		for await (const { buffer, timestamp } of iterator) {
			if (!this.editor.playback.getIsPlaying()) return;
			if (sessionId !== this.playbackSessionId) return;

			const timelineTime =
				clip.startTime +
				getClipTimeAtSourceTime({
					sourceTime: timestamp - clip.trimStart,
					retime: clip.retime,
				});
			if (timelineTime >= clipEnd) break;

			const node = audioContext.createBufferSource();
			node.buffer = buffer;
			if (clip.retime) {
				node.playbackRate.value = clampRetimeRate({ rate: clip.retime.rate });
			}
			const clipGain = audioContext.createGain();
			clipGain.gain.value = clip.volume;
			node.connect(clipGain);
			clipGain.connect(this.getClipDestination({ clip, audioContext }));

			const startTimestamp =
				this.playbackStartContextTime +
				this.playbackLatencyCompensationSeconds +
				(timelineTime - this.playbackStartTime);

			if (startTimestamp >= audioContext.currentTime) {
				node.start(startTimestamp);
				consecutiveDroppedBufferCount = 0;
			} else {
				const offset = audioContext.currentTime - startTimestamp;
				if (offset < buffer.duration) {
					node.start(audioContext.currentTime, offset);
					consecutiveDroppedBufferCount = 0;
				} else {
					consecutiveDroppedBufferCount += 1;
					if (consecutiveDroppedBufferCount >= 5) {
						const nextCompensationSeconds = Math.max(
							this.playbackLatencyCompensationSeconds,
							Math.min(0.25, offset + 0.01),
						);
						if (
							nextCompensationSeconds >
							this.playbackLatencyCompensationSeconds + 0.001
						) {
							this.playbackLatencyCompensationSeconds = nextCompensationSeconds;
						}
						const resyncStartTime = this.getPlaybackTime();
						this.clipIterators.delete(clip.id);
						this.runClipIterator({
							clip,
							startTime: resyncStartTime,
							sessionId,
						}).catch(ignoreInputDisposed);
						return;
					}
					continue;
				}
			}

			this.queuedSources.add(node);
			node.addEventListener("ended", () => {
				node.disconnect();
				clipGain.disconnect();
				this.queuedSources.delete(node);
			});

			const aheadTime = timelineTime - this.getPlaybackTime();
			if (aheadTime >= 1) {
				await this.waitUntilCaughtUp({ timelineTime, targetAhead: 1 });
				if (sessionId !== this.playbackSessionId) return;
			}
		}

		this.clipIterators.delete(clip.id);
		// don't remove from activeClipIds - prevents scheduler from restarting this clip
		// the set is cleared on stopPlayback anyway
	}

	private async schedulePreparedClip({
		clip,
		startTime,
		sessionId,
	}: {
		clip: AudioClipSource;
		startTime: number;
		sessionId: number;
	}): Promise<void> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) return;

		const buffer = await this.getPreparedClipBuffer({ clip });
		if (!buffer || !this.editor.playback.getIsPlaying()) return;
		if (sessionId !== this.playbackSessionId) return;

		const clipStart = clip.startTime;
		const clipEnd = clip.startTime + clip.duration;
		const playbackTimeAfterReady = this.getPlaybackTime();
		const effectiveStartTime = Math.max(
			startTime,
			clipStart,
			playbackTimeAfterReady,
		);
		if (effectiveStartTime >= clipEnd) {
			return;
		}

		const node = audioContext.createBufferSource();
		node.buffer = buffer;
		const clipGain = audioContext.createGain();
		node.connect(clipGain);
		clipGain.connect(this.getClipDestination({ clip, audioContext }));

		const startTimestamp =
			this.playbackStartContextTime +
			this.playbackLatencyCompensationSeconds +
			(effectiveStartTime - this.playbackStartTime);
		const clipOffset = effectiveStartTime - clipStart;
		let actualStartTimestamp = startTimestamp;
		let actualClipOffset = clipOffset;

		if (startTimestamp >= audioContext.currentTime) {
			node.start(startTimestamp, clipOffset);
		} else {
			const lateOffset = audioContext.currentTime - startTimestamp;
			actualStartTimestamp = audioContext.currentTime;
			actualClipOffset = clipOffset + lateOffset;
			node.start(actualStartTimestamp, actualClipOffset);
		}

		this.scheduleClipGainAutomation({
			audioContext,
			clip,
			clipGain,
			startTimestamp: actualStartTimestamp,
			startLocalTime: actualClipOffset,
		});

		this.queuedSources.add(node);
		node.addEventListener("ended", () => {
			node.disconnect();
			clipGain.disconnect();
			this.queuedSources.delete(node);
		});
	}

	private waitUntilCaughtUp({
		timelineTime,
		targetAhead,
	}: {
		timelineTime: number;
		targetAhead: number;
	}): Promise<void> {
		return new Promise((resolve) => {
			const checkInterval = setInterval(() => {
				if (!this.editor.playback.getIsPlaying()) {
					clearInterval(checkInterval);
					resolve();
					return;
				}

				const playbackTime = this.getPlaybackTime();
				if (timelineTime - playbackTime < targetAhead) {
					clearInterval(checkInterval);
					resolve();
				}
			}, 100);
		});
	}

	private disposeSinks(): void {
		for (const iterator of this.clipIterators.values()) {
			void iterator.return();
		}
		this.clipIterators.clear();
		this.activeClipIds.clear();

		for (const input of this.inputs.values()) {
			input.dispose();
		}
		this.inputs.clear();
		this.sinks.clear();
	}

	private shouldUsePreparedClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): boolean {
		return (
			this.hasCurveRetime({ clip }) ||
			hasGainAutomation({ element: clip.timelineElement }) ||
			shouldMaintainPitch({
				rate: clip.retime?.rate ?? 1,
				maintainPitch: clip.retime?.maintainPitch,
			})
		);
	}

	private hasCurveRetime({ clip }: { clip: AudioClipSource }): boolean {
		// 예전 프로젝트에 남은 곡선 리타임(mode: "curve")을 알아본다. 지금 타입에는 mode가 없다
		const retime = clip.retime;
		return (
			retime !== undefined && "mode" in retime && retime.mode === "curve"
		);
	}

	private scheduleClipGainAutomation({
		audioContext,
		clip,
		clipGain,
		startTimestamp,
		startLocalTime,
	}: {
		audioContext: AudioContext;
		clip: AudioClipSource;
		clipGain: GainNode;
		startTimestamp: number;
		startLocalTime: number;
	}): void {
		clipGain.gain.cancelScheduledValues(startTimestamp);
		clipGain.gain.setValueAtTime(clip.volume, startTimestamp);

		if (!hasGainAutomation({ element: clip.timelineElement })) {
			return;
		}

		const points = buildAudioGainAutomation({
			element: clip.timelineElement,
			fromLocalTime: startLocalTime,
			toLocalTime: clip.duration,
		});

		if (points.length === 0) {
			return;
		}

		clipGain.gain.setValueAtTime(points[0].gain, startTimestamp);
		for (let index = 1; index < points.length; index++) {
			const point = points[index];
			const pointTimestamp =
				startTimestamp + (point.localTime - startLocalTime);
			if (pointTimestamp < audioContext.currentTime) {
				continue;
			}

			clipGain.gain.linearRampToValueAtTime(point.gain, pointTimestamp);
		}
	}

	private buildPreparedClipCacheKey({
		clip,
	}: {
		clip: AudioClipSource;
	}): string {
		return JSON.stringify({
			id: clip.id,
			sourceKey: clip.sourceKey,
			startTime: clip.startTime,
			duration: clip.duration,
			trimStart: clip.trimStart,
			trimEnd: clip.trimEnd,
			retime: clip.retime ?? null,
		});
	}

	private async getPreparedClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const cacheKey = this.buildPreparedClipCacheKey({ clip });
		const existing = this.preparedClipBuffers.get(cacheKey);
		if (existing) {
			return existing;
		}

		const promise = (async () => {
			const audioContext = this.ensureAudioContext();
			if (!audioContext) {
				return null;
			}

			const decodedBuffer = await this.getDecodedBuffer({ clip });
			if (!decodedBuffer) {
				return null;
			}

			return await renderRetimedBuffer({
				audioContext,
				sourceBuffer: decodedBuffer,
				trimStart: clip.trimStart,
				clipDuration: clip.duration,
				retime: clip.retime,
				maintainPitch: clip.retime?.maintainPitch === true,
			});
		})();

		this.preparedClipBuffers.set(cacheKey, promise);
		return promise;
	}

	private async getDecodedBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const existing = this.decodedBuffers.get(clip.sourceKey);
		if (existing) {
			return existing;
		}

		const promise = this.decodeClipBuffer({ clip });
		this.decodedBuffers.set(clip.sourceKey, promise);
		return promise;
	}

	private async decodeClipBuffer({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBuffer | null> {
		const audioContext = this.ensureAudioContext();
		if (!audioContext) {
			return null;
		}

		const input = new Input({
			source: new BlobSource(clip.file),
			formats: ALL_FORMATS,
		});

		try {
			const audioTrack = await input.getPrimaryAudioTrack();
			if (!audioTrack) {
				return null;
			}

			const sink = new AudioBufferSink(audioTrack);
			const chunks: AudioBuffer[] = [];
			let totalSamples = 0;

			for await (const { buffer } of sink.buffers(0)) {
				chunks.push(buffer);
				totalSamples += buffer.length;
			}

			if (chunks.length === 0) {
				return null;
			}

			const targetSampleRate = audioContext.sampleRate;
			const nativeSampleRate = chunks[0].sampleRate;
			const numChannels = Math.min(2, chunks[0].numberOfChannels);
			const nativeChannels = Array.from(
				{ length: numChannels },
				() => new Float32Array(totalSamples),
			);

			let offset = 0;
			for (const chunk of chunks) {
				for (let channel = 0; channel < numChannels; channel++) {
					nativeChannels[channel].set(
						chunk.getChannelData(Math.min(channel, chunk.numberOfChannels - 1)),
						offset,
					);
				}
				offset += chunk.length;
			}

			const outputSamples = Math.ceil(
				totalSamples * (targetSampleRate / nativeSampleRate),
			);
			const offlineContext = new OfflineAudioContext(
				numChannels,
				outputSamples,
				targetSampleRate,
			);
			const nativeBuffer = audioContext.createBuffer(
				numChannels,
				totalSamples,
				nativeSampleRate,
			);

			for (let channel = 0; channel < numChannels; channel++) {
				nativeBuffer.copyToChannel(nativeChannels[channel], channel);
			}

			const sourceNode = offlineContext.createBufferSource();
			sourceNode.buffer = nativeBuffer;
			sourceNode.connect(offlineContext.destination);
			sourceNode.start(0);

			return await offlineContext.startRendering();
		} catch (error) {
			console.warn("Failed to decode clip audio:", error);
			return null;
		} finally {
			input.dispose();
		}
	}

	private async getAudioSink({
		clip,
	}: {
		clip: AudioClipSource;
	}): Promise<AudioBufferSink | null> {
		const existingSink = this.sinks.get(clip.sourceKey);
		if (existingSink) return existingSink;

		try {
			const input = new Input({
				source: new BlobSource(clip.file),
				formats: ALL_FORMATS,
			});
			const audioTrack = await input.getPrimaryAudioTrack();
			if (!audioTrack) {
				input.dispose();
				return null;
			}

			const sink = new AudioBufferSink(audioTrack);
			this.inputs.set(clip.sourceKey, input);
			this.sinks.set(clip.sourceKey, sink);
			return sink;
		} catch (error) {
			console.warn("Failed to initialize audio sink:", error);
			return null;
		}
	}
}
