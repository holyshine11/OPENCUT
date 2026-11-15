import { describe, expect, test } from "bun:test";
import { stretchKeepingPitch } from "../audio-stretch";

const SAMPLE_RATE = 48000;
const rms = ({ data, from, to }: { data: Float32Array; from: number; to: number }) => {
	let sum = 0;
	for (let i = from; i < to; i++) sum += data[i] * data[i];
	return Math.sqrt(sum / (to - from));
};

describe("stretchKeepingPitch", () => {
	test("1.2배속에서도 처음과 끝소리가 살아 있다", () => {
		const seconds = 2;
		const tone = Float32Array.from(
			{ length: seconds * SAMPLE_RATE },
			(_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE),
		);
		const length = Math.ceil((seconds / 1.2) * SAMPLE_RATE);
		const [out] = stretchKeepingPitch({
			channels: [tone],
			rate: 1.2,
			sampleRate: SAMPLE_RATE,
			length,
		});
		const window = SAMPLE_RATE / 20;
		expect(out.length).toBe(length);
		expect(rms({ data: out, from: 0, to: window })).toBeGreaterThan(0.2);
		// 예전에는 마지막 0.3초가량이 무음이었다
		expect(rms({ data: out, from: length - window, to: length })).toBeGreaterThan(0.2);
	});
});
