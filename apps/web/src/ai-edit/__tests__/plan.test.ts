import { describe, expect, test } from "bun:test";
import { activeLoudness, coverScale, parsePlan, placeBeats, revisePlan, sfxTime, sfxVolume } from "../plan";

const durations = { c01: 10, c02: 4 };

describe("parsePlan", () => {
	test("설명이 섞여 있어도 JSON을 꺼내고 구간을 클립 안으로 자른다", () => {
		const plan = parsePlan({
			durations,
			sounds: ["띵.mp3"],
			bgms: ["재즈 - 곡.mp3".normalize("NFD")],
			output: `[5/5] 검토 끝\n${JSON.stringify({
				concept: "컨셉",
				hook: "훅",
				look: "food",
				bgm: "재즈 - 곡.mp3",
				beats: [
					{
							clip: "c01", start: -1, end: 3, narration: " 가 ", caption: "나", transition: "dissolve",
							voice: "husband", sfx: "띵.mp3", sfxOn: " 가 ", impact: "zoom",
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
		expect(first).toMatchObject({ voice: "husband", sfx: "띵.mp3", sfxOn: "가", impact: "zoom" });
		// 배경음악도 목록에 있는 파일 이름으로 돌려준다
		expect(plan.bgm).toBe("재즈 - 곡.mp3".normalize("NFD"));
		// 영역은 1.6배로 키우고, 숫자가 아닌 것은 버리고, 프레임 밖은 자른다
		expect(first.mosaic).toHaveLength(2);
		expect(first.mosaic[0].x).toBeCloseTo(0.34);
		expect(first.mosaic[0].w).toBeCloseTo(0.32);
		expect(first.mosaic[1].x + first.mosaic[1].w).toBe(1);
		expect(first.mosaic[1].y).toBe(0);
		// 모르는 전환·효과음·효과는 버리고 목소리는 아내가 기본이다
		expect(second).toEqual({
			clip: "c02", start: 2, end: 4, narration: "", caption: "", transition: null,
			voice: "wife", sfx: null, sfxOn: "", impact: null, mosaic: [],
		});
		expect(plan.look).toBe("food");
		expect(plan.youtube.tags).toEqual(["a"]);
	});

	test("자모가 풀린(NFD) 파일 이름도 모델이 붙여 쓴(NFC) 이름과 같은 효과음으로 본다", () => {
		const file = "띠용 뭔가 이상할 때.mp3".normalize("NFD");
		const plan = parsePlan({
			durations,
			sounds: [file],
			output: JSON.stringify({ beats: [{ clip: "c01", start: 0, end: 2, sfx: "띠용 뭔가 이상할 때.mp3" }] }),
		});
		expect(plan.beats[0].sfx).toBe(file);
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
		expect(sfxVolume({ level: { loudness: -10, peak: -10 }, underVoice: false })).toBe(-12);
		expect(sfxVolume({ level: { loudness: -10, peak: -10 }, underVoice: true })).toBe(-16);
		// 아주 작게 녹음된 소리도 +6dB까지만 키운다
		expect(sfxVolume({ level: { loudness: -50, peak: -40 }, underVoice: false })).toBe(6);
		expect(sfxVolume({ level: null, underVoice: false })).toBe(-12);
		// 평균은 작아도 튀는 소리(칼질)는 순간 최대치가 -9dBFS를 넘지 않게 덜 키운다
		expect(sfxVolume({ level: { loudness: -26, peak: 0 }, underVoice: false })).toBe(-9);
		expect(sfxVolume({ level: { loudness: -26, peak: 0 }, underVoice: true })).toBe(-13);
	});

	test("효과음은 sfxOn 낱말이 읽히는 자리에, 없으면 내레이션(없으면 컷) 시작에 떨어진다", () => {
		const placed = { at: 10, length: 5, voiceAt: 11 };
		const narration = "근데 쪄 봤더니 그냥 날것"; // 14자, "그냥"은 9번째 자리
		expect(sfxTime({ beat: { narration, sfxOn: "그냥" }, placed, voice: 2.8 })).toBeCloseTo(11 + (2.8 * 9) / 14);
		expect(sfxTime({ beat: { narration, sfxOn: "" }, placed, voice: 2.8 })).toBe(11);
		expect(sfxTime({ beat: { narration, sfxOn: "없는말" }, placed, voice: 2.8 })).toBe(11);
		expect(sfxTime({ beat: { narration: "", sfxOn: "" }, placed: { ...placed, voiceAt: null }, voice: null })).toBe(10);
	});

	test("무음 구간은 빼고 크기를 잰다", () => {
		const level = activeLoudness(new Float32Array([0, 0, 0.5, -0.5, 0, 0]));
		expect(level?.loudness).toBeCloseTo(-6.02, 1);
		expect(level?.peak).toBeCloseTo(-6.02, 1);
		expect(activeLoudness(new Float32Array([0, 0.001]))).toBeNull();
	});
});

describe("revisePlan", () => {
	const beat = ({ clip, start, end, caption }: { clip: string; start: number; end: number; caption: string }) => ({
		clip, start, end, narration: "", voice: "wife" as const, caption, transition: null, sfx: null, sfxOn: "",
		impact: null,
		mosaic: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
	});
	const previous = {
		concept: "컨셉", hook: "훅", look: "food", bgm: "재즈.mp3",
		beats: [
			beat({ clip: "c01", start: 0, end: 2, caption: "하나" }),
			beat({ clip: "c01", start: 4, end: 6, caption: "둘" }),
			beat({ clip: "c02", start: 0, end: 2, caption: "셋" }),
		],
		youtube: { title: "제목", description: "설명", tags: ["a"] },
		review: ["지난 메모"],
	};
	const revise = ({
		output,
		clips = durations,
		scope,
	}: {
		output: object;
		clips?: Record<string, number>;
		scope?: "sfx" | "cuts" | "bgm";
	}) => revisePlan({ previous, durations: clips, sounds: ["띵.mp3"], bgms: ["재즈.mp3", "힙합.mp3"], scope, output: `[5/5] 끝\n${JSON.stringify(output)}` });

	test("범위를 고르면 그 범위의 항목만 바뀐다", () => {
		const output = {
			changes: [
				{ beat: 1, set: { caption: "새 자막", sfx: "띵.mp3", end: 3 } },
				{ beat: 2, remove: true },
				{ after: 3, add: { clip: "c01", start: 7, end: 9, caption: "끝" } },
			],
			bgm: "힙합.mp3",
			look: "warm",
			youtube: { title: "새 제목" },
		};
		const sfx = revise({ scope: "sfx", output }).plan;
		expect(sfx.beats).toHaveLength(3);
		expect(sfx.beats[0]).toEqual({ ...previous.beats[0], sfx: "띵.mp3" });
		expect(sfx.youtube.title).toBe("제목");
		expect(sfx.look).toBe("food");
		expect(sfx.bgm).toBe("재즈.mp3");
		// BGM만 고르면 곡만 바뀌고 컷은 그대로다. null은 곡을 빼고, 목록에 없는 이름은 무시한다
		const bgm = revise({ scope: "bgm", output });
		expect(bgm.changed).toBe(true);
		expect(bgm.plan.bgm).toBe("힙합.mp3");
		expect(bgm.plan.beats).toEqual(previous.beats);
		expect(revise({ scope: "bgm", output: { bgm: null } }).plan.bgm).toBeNull();
		expect(revise({ scope: "bgm", output: { bgm: "없는곡.mp3" } }).changed).toBe(false);
		// 컷편집은 컷을 넣고 빼고 구간을 고치되, 있던 컷의 자막·효과음은 그대로 둔다
		const cuts = revise({ scope: "cuts", output }).plan;
		expect(cuts.beats.map((item) => item.caption)).toEqual(["하나", "셋", "끝"]);
		expect(cuts.beats[0]).toMatchObject({ end: 3, sfx: null });
	});

	test("고친 컷만 바뀌고 나머지와 안 건드린 모자이크는 그대로다", () => {
		const { plan, changed } = revise({ output: {
			changes: [
				{ beat: 1, set: { caption: "새 자막", end: 99, sfx: "띵.mp3" } },
				{ beat: 2, remove: true },
				{ after: 0, add: { clip: "c02", start: 2, end: 4, caption: "훅" } },
				{ after: 3, add: { clip: "c01", start: 7, end: 9, caption: "끝" } },
				{ after: 1, add: { clip: "c09", start: 0, end: 2 } },
				{ beat: 3, set: { start: 1.9 } },
			],
			youtube: { title: "새 제목" },
			review: ["1번 컷 자막을 줄임"],
		} });
		expect(changed).toBe(true);
		expect(plan.beats.map((item) => item.caption)).toEqual(["훅", "새 자막", "셋", "끝"]);
		expect(plan.beats[1]).toMatchObject({ end: 10, sfx: "띵.mp3", mosaic: previous.beats[0].mosaic });
		// 너무 짧아지는 수정은 버리고 원래 컷을 둔다
		expect(plan.beats[2]).toBe(previous.beats[2]);
		expect(plan.youtube).toEqual({ title: "새 제목", description: "설명", tags: ["a"] });
		expect(plan.look).toBe("food");
		expect(plan.review).toEqual(["1번 컷 자막을 줄임"]);
	});

	test("고칠 게 없으면 changed가 false다", () => {
		const { plan, changed } = revise({ output: { changes: [], review: ["고칠 곳 없음"] } });
		expect(changed).toBe(false);
		expect(plan.beats).toEqual(previous.beats);
	});

	test("지운 클립의 컷은 빠지고, 남는 컷이 없으면 던진다", () => {
		expect(revise({ output: { changes: [] }, clips: { c01: 10 } }).plan.beats).toHaveLength(2);
		expect(() => revise({ output: { changes: [1, 2, 3].map((number) => ({ beat: number, remove: true })) } })).toThrow();
	});
});
