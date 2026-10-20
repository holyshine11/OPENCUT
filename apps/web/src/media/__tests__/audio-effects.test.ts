import { describe, expect, test } from "bun:test";
import type { TimelineElement } from "@/timeline";
import { getAudioEffects, getAudioEffectTailSeconds } from "../audio-effects";

const withParams = (params: Record<string, unknown>) =>
	({ params }) as unknown as TimelineElement;

describe("getAudioEffects", () => {
	test("꺼져 있으면 null", () => {
		expect(getAudioEffects({ element: withParams({ reverbMix: 80 }) })).toBeNull();
	});

	test("퍼센트 값을 0~1로 읽고 빠진 값은 기본값", () => {
		const settings = getAudioEffects({
			element: withParams({ delay: true, delayMix: 50, delayTime: 0.5 }),
		});
		expect(settings?.reverb).toBeNull();
		expect(settings?.delay?.mix).toBe(0.5);
		expect(settings?.delay?.time).toBe(0.5);
		expect(settings?.delay?.feedback).toBeCloseTo(0.3);
	});
});

describe("getAudioEffectTailSeconds", () => {
	test("리버브 꼬리는 감쇠 길이", () => {
		const settings = getAudioEffects({
			element: withParams({ reverb: true, reverbDecay: 3 }),
		});
		expect(settings && getAudioEffectTailSeconds(settings)).toBe(3);
	});

	test("피드백이 클수록 꼬리가 길고 상한에서 멈춘다", () => {
		const short = getAudioEffects({
			element: withParams({ delay: true, delayFeedback: 10 }),
		});
		const long = getAudioEffects({
			element: withParams({ delay: true, delayFeedback: 90, delayTime: 1.5 }),
		});
		if (!short || !long) throw new Error("expected settings");
		expect(getAudioEffectTailSeconds(short)).toBeCloseTo(1.2);
		expect(getAudioEffectTailSeconds(long)).toBe(10);
	});
});
