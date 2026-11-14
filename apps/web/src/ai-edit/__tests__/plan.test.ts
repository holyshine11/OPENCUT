import { describe, expect, test } from "bun:test";
import { activeLoudness, coverScale, parsePlan, placeBeats, sfxVolume } from "../plan";

const durations = { c01: 10, c02: 4 };

describe("parsePlan", () => {
	test("설명이 섞여 있어도 JSON을 꺼내고 구간을 클립 안으로 자른다", () => {
		const plan = parsePlan({
			durations,
			sounds: ["띵.mp3"],
			output: `[5/5] 검토 끝\n${JSON.stringify({
				concept: "컨셉",
				hook: "훅",
				look: "food",
				beats: [
					{
							clip: "c01", start: -1, end: 3, narration: " 가 ", caption: "나", transition: "dissolve",
							voice: "husband", sfx: "띵.mp3", impact: "zoom",
							mosaic: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, { x: "a" }, { x: 0.95, y: 0, w: 0.1, h: 0.1 }],
						},
					{ clip: "c02", start: 2, end: 99, narration: "", caption: "", transition: "wipe", sfx: "없는소리.mp3", impact: "explode" },
					{ clip: "c09", start: 0, end: 2 },
					{ clip: "c01", start: 5, end: 5.1 },
				],
				youtube: { title: "제목", description: "설명", tags: ["a", 3] },
				review: ["확인"],
			})}`,
		});
		const [first, second] = plan.beats;
		expect(first).toMatchObject({ clip: "c01", start: 0, end: 3, narration: "가", caption: "나", transition: "dissolve" });
		expect(first).toMatchObject({ voice: "husband", sfx: "띵.mp3", impact: "zoom" });
		// 영역은 1.6배로 키우고, 숫자가 아닌 것은 버리고, 프레임 밖은 자른다
		expect(first.mosaic).toHaveLength(2);
		expect(first.mosaic[0].x).toBeCloseTo(0.34);
		expect(first.mosaic[0].w).toBeCloseTo(0.32);
		expect(first.mosaic[1].x + first.mosaic[1].w).toBe(1);
		expect(first.mosaic[1].y).toBe(0);
		// 모르는 전환·효과음·효과는 버리고 목소리는 아내가 기본이다
		expect(second).toEqual({
			clip: "c02", start: 2, end: 4, narration: "", caption: "", transition: null,
			voice: "wife", sfx: null, impact: null, mosaic: [],
		});
		expect(plan.look).toBe("food");
		expect(plan.youtube.tags).toEqual(["a"]);
	});

	test("쓸 컷이 없으면 던진다", () => {
		expect(() => parsePlan({ durations, output: '{"beats":[]}' })).toThrow();
		expect(() => parsePlan({ durations, output: "죄송합니다" })).toThrow();
	});
});

describe("placeBeats", () => {
	const beat = ({ clip, start, end }: { clip: string; start: number; end: number }) => ({
		clip,
		start,
		end,
		narration: "",
		caption: "",
		transition: null,
	});

	test("내레이션이 길면 컷을 늘리고, 원본이 모자라면 다음 음성을 미룬다", () => {
		const placed = placeBeats({
			beats: [
				beat({ clip: "c01", start: 0, end: 2 }),
				beat({ clip: "c02", start: 3, end: 4 }),
				beat({ clip: "c01", start: 4, end: 6 }),
			],
			voices: [3, 2, null],
			durations,
			pause: 0.5,
		});
		// 첫 컷: 음성 3초 + 쉼 0.5초만큼 늘어난다
		expect(placed[0]).toEqual({ at: 0, length: 3.5, voiceAt: 0 });
		// 둘째 컷: 원본이 1초뿐이라 못 늘리고 음성은 컷 시작부터 나온다
		expect(placed[1]).toEqual({ at: 3.5, length: 1, voiceAt: 3.5 });
		// 셋째 컷: 음성이 없다
		expect(placed[2]).toEqual({ at: 4.5, length: 2, voiceAt: null });
	});

	test("앞 음성이 아직 나오는 중이면 다음 음성은 그 뒤에 시작한다", () => {
		const placed = placeBeats({
			beats: [beat({ clip: "c02", start: 3, end: 4 }), beat({ clip: "c01", start: 0, end: 2 })],
			voices: [2, 1],
			durations,
			pause: 0,
		});
		expect(placed[1].voiceAt).toBe(2);
		expect(placed[1].length).toBe(2);
	});
});

describe("화면 맞춤과 믹싱", () => {
	test("가로 원본을 세로 화면에 꽉 채우는 배율", () => {
		expect(coverScale({ source: { width: 1920, height: 1080 }, canvas: { width: 1080, height: 1920 } })).toBeCloseTo(3.16, 2);
		expect(coverScale({ source: { width: 1080, height: 1920 }, canvas: { width: 1080, height: 1920 } })).toBe(1);
	});

	test("효과음은 잰 크기를 기준 크기로 맞추고, 내레이션과 겹치면 더 낮춘다", () => {
		expect(sfxVolume({ loudness: -10, underVoice: false })).toBe(-12);
		expect(sfxVolume({ loudness: -10, underVoice: true })).toBe(-16);
		// 아주 작게 녹음된 소리도 +6dB까지만 키운다
		expect(sfxVolume({ loudness: -50, underVoice: false })).toBe(6);
		expect(sfxVolume({ loudness: null, underVoice: false })).toBe(-12);
	});

	test("무음 구간은 빼고 크기를 잰다", () => {
		expect(activeLoudness(new Float32Array([0, 0, 0.5, -0.5, 0, 0]))).toBeCloseTo(-6.02, 1);
		expect(activeLoudness(new Float32Array([0, 0.001]))).toBeNull();
	});
});
