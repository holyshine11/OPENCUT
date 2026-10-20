import { describe, expect, test } from "bun:test";
import {
	getTrackGain,
	getTrackPan,
	isTrackSilencedBySolo,
	panStereoSample,
} from "../audio-mix";
import type { AudioTrack, TextTrack } from "../types";

const audioTrack = (patch: Partial<AudioTrack>): AudioTrack => ({
	id: "a",
	name: "Audio",
	type: "audio",
	elements: [],
	muted: false,
	...patch,
});

describe("track mix", () => {
	test("페이더 dB를 선형 게인으로, 기본은 0 dB", () => {
		expect(getTrackGain(audioTrack({}))).toBe(1);
		expect(getTrackGain(audioTrack({ volume: -6 }))).toBeCloseTo(0.501, 3);
		const text: TextTrack = {
			id: "t",
			name: "T",
			type: "text",
			elements: [],
			hidden: false,
		};
		expect(getTrackGain(text)).toBe(1);
	});

	test("팬은 -1~1로 자른다", () => {
		expect(getTrackPan(audioTrack({ pan: 3 }))).toBe(1);
		expect(getTrackPan(audioTrack({ pan: Number.NaN }))).toBe(0);
	});
});

describe("panStereoSample (StereoPannerNode 공식)", () => {
	test("가운데는 그대로, 모노는 양쪽 복제", () => {
		expect(panStereoSample({ l: 0.5, r: 0.2, pan: 0, isMono: false })).toEqual([
			0.5, 0.2,
		]);
		expect(panStereoSample({ l: 0.5, r: 0, pan: 0, isMono: true })).toEqual([
			0.5, 0.5,
		]);
	});

	test("완전 왼쪽이면 스테레오 R이 L로 모인다", () => {
		const [l, r] = panStereoSample({ l: 0.3, r: 0.4, pan: -1, isMono: false });
		expect(l).toBeCloseTo(0.7);
		expect(r).toBeCloseTo(0);
	});

	test("모노 완전 오른쪽은 오른쪽만, 가운데 근처는 등전력", () => {
		const [l, r] = panStereoSample({ l: 1, r: 0, pan: 1, isMono: true });
		expect(l).toBeCloseTo(0);
		expect(r).toBeCloseTo(1);
		const [cl, cr] = panStereoSample({ l: 1, r: 0, pan: 1e-9, isMono: true });
		expect(cl ** 2 + cr ** 2).toBeCloseTo(1);
	});
});

test("페이더 맨 아래는 무음", () => {
	expect(getTrackGain(audioTrack({ volume: -60 }))).toBe(0);
});

test("솔로 트랙이 있으면 솔로가 아닌 트랙만 빠진다", () => {
	const soloed = audioTrack({ id: "s", solo: true });
	const other = audioTrack({ id: "o" });
	const tracks = [soloed, other];
	expect(isTrackSilencedBySolo({ track: soloed, tracks })).toBe(false);
	expect(isTrackSilencedBySolo({ track: other, tracks })).toBe(true);
	expect(isTrackSilencedBySolo({ track: other, tracks: [other] })).toBe(false);
});
