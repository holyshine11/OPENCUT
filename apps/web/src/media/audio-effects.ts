import type { TimelineElement } from "@/timeline";

/** 클립 오디오 이펙트(리버브·에코·딜레이). 재생과 내보내기가 같은 노드 체인을 쓴다 */
export const AUDIO_EFFECT_LIMITS = {
	mixPercent: { min: 0, max: 100, default: 30 },
	reverbDecay: { min: 0.3, max: 6, default: 2 },
	echoFeedbackPercent: { min: 0, max: 90, default: 40 },
	delayTime: { min: 0.02, max: 1.5, default: 0.3 },
	delayFeedbackPercent: { min: 0, max: 90, default: 30 },
} as const;

/** 에코는 반복 간격을 고정하고 감쇠만 조절한다 */
const ECHO_TIME_SECONDS = 0.35;
/** 꼬리가 이 비율(-60 dB) 아래로 떨어지면 끝난 것으로 본다 */
const TAIL_SILENCE_RATIO = 0.001;
const MAX_TAIL_SECONDS = 10;
const REVERB_DECAY_POWER = 3;

export interface AudioEffectSettings {
	reverb: { mix: number; decay: number } | null;
	echo: { mix: number; feedback: number } | null;
	delay: { mix: number; time: number; feedback: number } | null;
}

function readNumber(
	params: Record<string, unknown>,
	key: string,
	fallback: number,
): number {
	const value = params[key];
	return typeof value === "number" ? value : fallback;
}

/** 켜진 이펙트가 없으면 null */
export function getAudioEffects({
	element,
}: {
	element: TimelineElement;
}): AudioEffectSettings | null {
	if (!("params" in element)) return null;
	const p = element.params as Record<string, unknown>;
	const L = AUDIO_EFFECT_LIMITS;
	const percent = (key: string, fallback: number) =>
		readNumber(p, key, fallback) / 100;
	const settings: AudioEffectSettings = {
		reverb:
			p.reverb === true
				? {
						mix: percent("reverbMix", L.mixPercent.default),
						decay: readNumber(p, "reverbDecay", L.reverbDecay.default),
					}
				: null,
		echo:
			p.echo === true
				? {
						mix: percent("echoMix", L.mixPercent.default),
						feedback: percent("echoFeedback", L.echoFeedbackPercent.default),
					}
				: null,
		delay:
			p.delay === true
				? {
						mix: percent("delayMix", L.mixPercent.default),
						time: readNumber(p, "delayTime", L.delayTime.default),
						feedback: percent("delayFeedback", L.delayFeedbackPercent.default),
					}
				: null,
	};
	return settings.reverb || settings.echo || settings.delay ? settings : null;
}

function feedbackTail({
	time,
	feedback,
}: {
	time: number;
	feedback: number;
}): number {
	if (feedback <= 0) return time;
	const repeats = Math.log(TAIL_SILENCE_RATIO) / Math.log(feedback);
	return time * (1 + repeats);
}

/** 클립이 끝난 뒤에도 이펙트가 울리는 시간(초) */
export function getAudioEffectTailSeconds(settings: AudioEffectSettings): number {
	const tails = [
		settings.reverb?.decay ?? 0,
		settings.echo
			? feedbackTail({ time: ECHO_TIME_SECONDS, feedback: settings.echo.feedback })
			: 0,
		settings.delay ? feedbackTail(settings.delay) : 0,
	];
	return Math.min(MAX_TAIL_SECONDS, Math.max(...tails));
}

function createReverbImpulse({
	context,
	decay,
}: {
	context: BaseAudioContext;
	decay: number;
}): AudioBuffer {
	const length = Math.max(1, Math.round(decay * context.sampleRate));
	const impulse = context.createBuffer(2, length, context.sampleRate);
	for (let channel = 0; channel < 2; channel++) {
		const data = impulse.getChannelData(channel);
		for (let i = 0; i < length; i++) {
			data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** REVERB_DECAY_POWER;
		}
	}
	return impulse;
}

function connectFeedbackDelay({
	context,
	input,
	output,
	time,
	feedback,
	mix,
}: {
	context: BaseAudioContext;
	input: AudioNode;
	output: AudioNode;
	time: number;
	feedback: number;
	mix: number;
}): AudioNode[] {
	const delay = context.createDelay(AUDIO_EFFECT_LIMITS.delayTime.max);
	delay.delayTime.value = time;
	const loop = context.createGain();
	loop.gain.value = feedback;
	const wet = context.createGain();
	wet.gain.value = mix;
	input.connect(delay);
	delay.connect(loop);
	loop.connect(delay);
	delay.connect(wet);
	wet.connect(output);
	return [delay, loop, wet];
}

/**
 * input → output 원음에 켜진 이펙트의 wet 신호를 병렬로 더한다.
 * 돌려준 노드를 disconnect 하면 체인이 풀린다
 */
export function connectAudioEffects({
	context,
	input,
	output,
	settings,
}: {
	context: BaseAudioContext;
	input: AudioNode;
	output: AudioNode;
	settings: AudioEffectSettings;
}): AudioNode[] {
	input.connect(output);
	const nodes: AudioNode[] = [];
	if (settings.reverb) {
		const convolver = context.createConvolver();
		convolver.buffer = createReverbImpulse({
			context,
			decay: settings.reverb.decay,
		});
		const wet = context.createGain();
		wet.gain.value = settings.reverb.mix;
		input.connect(convolver);
		convolver.connect(wet);
		wet.connect(output);
		nodes.push(convolver, wet);
	}
	if (settings.echo) {
		nodes.push(
			...connectFeedbackDelay({
				context,
				input,
				output,
				time: ECHO_TIME_SECONDS,
				...settings.echo,
			}),
		);
	}
	if (settings.delay) {
		nodes.push(...connectFeedbackDelay({ context, input, output, ...settings.delay }));
	}
	return nodes;
}

/** 내보내기용. 스테레오 버퍼를 이펙트 체인에 통과시킨다. 결과 길이는 입력과 같다 */
export async function renderAudioEffects({
	buffer,
	settings,
}: {
	buffer: AudioBuffer;
	settings: AudioEffectSettings;
}): Promise<AudioBuffer> {
	const context = new OfflineAudioContext(
		buffer.numberOfChannels,
		buffer.length,
		buffer.sampleRate,
	);
	const source = context.createBufferSource();
	source.buffer = buffer;
	connectAudioEffects({
		context,
		input: source,
		output: context.destination,
		settings,
	});
	source.start(0);
	return await context.startRendering();
}
