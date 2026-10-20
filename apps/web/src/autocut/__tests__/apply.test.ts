import { describe, expect, test } from "bun:test";
import type { AudioTrack, SceneTracks, TextElement, VideoElement } from "@/timeline/types";
import { floatToFrameRate } from "@/fps/utils";
import { mediaTimeFromSeconds as t, TICKS_PER_SECOND, ZERO_MEDIA_TIME } from "@/wasm";
import { applyTimelineEdits, collectSubtitleWords, sourceCutsToTimeline } from "../apply";

const seconds = (ticks: number) => Number((ticks / TICKS_PER_SECOND).toFixed(3));
const round = (values: number[] | undefined) => values?.map((value) => Number(value.toFixed(3)));

function video(overrides: Partial<VideoElement> = {}): VideoElement {
	return {
		id: "v",
		type: "video",
		name: "clip",
		startTime: ZERO_MEDIA_TIME,
		duration: t({ seconds: 10 }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		mediaId: "m",
		params: {},
		...overrides,
	};
}

function caption({
	id,
	start,
	length,
	offsets,
}: {
	id: string;
	start: number;
	length: number;
	offsets?: number[];
}): TextElement {
	return {
		id,
		type: "text",
		name: id,
		startTime: t({ seconds: start }),
		duration: t({ seconds: length }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
		subtitleWordOffsets: offsets,
	};
}

const music: AudioTrack = {
	id: "bgm",
	type: "audio",
	name: "bgm",
	muted: false,
	elements: [
		{
			id: "song",
			type: "audio",
			sourceType: "upload",
			mediaId: "song",
			name: "song",
			startTime: ZERO_MEDIA_TIME,
			duration: t({ seconds: 10 }),
			trimStart: ZERO_MEDIA_TIME,
			trimEnd: ZERO_MEDIA_TIME,
			params: {},
		},
	],
};

function tracks(): SceneTracks {
	return [
		{
			id: "subs",
			type: "text",
			name: "subs",
			hidden: false,
			elements: [
				caption({ id: "a", start: 1, length: 1 }),
				// 끝이 잘린다: 단어 3.1초가 사라진다
				caption({ id: "d", start: 2.5, length: 1, offsets: [0, 0.6] }),
				// 통째로 잘린다
				caption({ id: "b", start: 3.5, length: 1 }),
				// 앞이 잘린다: 단어 4.5초가 사라지고 5.2초는 그대로 음성에 붙어 있다
				caption({ id: "e", start: 4.5, length: 1, offsets: [0, 0.7] }),
				// 가운데가 잘린다: 6.2·6.7초가 사라지고 7.1초는 1초 당겨진다
				caption({ id: "c", start: 5.5, length: 2, offsets: [0, 0.3, 0.7, 1.2, 1.6] }),
			],
		},
		{ id: "main", type: "video", name: "main", muted: false, hidden: false, elements: [video()] },
		music,
	];
}

const span = (element: { startTime: number; duration: number }) => [
	seconds(element.startTime),
	seconds(element.startTime + element.duration),
];

const fps = floatToFrameRate(30);

describe("applyTimelineEdits 컷", () => {
	const result = applyTimelineEdits({
		tracks: tracks(),
		edits: [
			{ start: t({ seconds: 3 }), end: t({ seconds: 5 }) },
			{ start: t({ seconds: 6 }), end: t({ seconds: 7 }) },
		],
		shouldEdit: (track) => track.id !== "bgm",
		crossfadeSeconds: 0.02,
		maintainPitch: true,
		fps,
	});
	const [subs, main, bgm] = result;

	test("클립을 나눠 구간을 지우고 남은 조각을 이어 붙인다", () => {
		expect(main.elements.map(span)).toEqual([
			[0, 3],
			[3, 4],
			[4, 7],
		]);
		expect(main.elements.map((element) => seconds(element.trimStart))).toEqual([0, 5, 7]);
		expect(main.elements.every((element) => element.name === "clip")).toBe(true);
	});

	test("첫 조각이 원래 id를 이어받고, 맞붙은 자리마다 짧은 크로스페이드가 걸린다", () => {
		expect(main.elements.map((element) => element.id === "v")).toEqual([true, false, false]);
		expect(main.elements.map((element) => element.params.crossfade ?? 0)).toEqual([
			0.02, 0.02, 0,
		]);
	});

	test("자막은 나누지 않고 줄이며, 잘린 단어는 빼고 뒤 단어는 당긴다", () => {
		expect(
			subs.elements.map((element) => [
				element.id,
				...span(element),
				round(element.type === "text" ? element.subtitleWordOffsets : undefined),
			]),
		).toEqual([
			["a", 1, 2, undefined],
			["d", 2.5, 3, [0]],
			["e", 3, 3.5, [0.7]],
			["c", 3.5, 4.5, [0, 0.3, 0.6]],
		]);
	});

	test("고르지 않은 트랙(배경음악)은 그대로 둔다", () => {
		expect(bgm).toBe(music);
	});
});

describe("applyTimelineEdits 배속", () => {
	// 2~6초(4초)를 4배속으로: 1초로 줄고 뒤는 3초 당겨진다
	const [subs, main, bgm] = applyTimelineEdits({
		tracks: tracks(),
		edits: [{ start: t({ seconds: 2 }), end: t({ seconds: 6 }), rate: 4 }],
		shouldEdit: (track) => track.id !== "bgm",
		crossfadeSeconds: 0.02,
		maintainPitch: true,
		fps,
	});

	test("클립을 구간 경계에서 나누고 가운데 조각만 빠르게 한다", () => {
		expect(main.elements.map(span)).toEqual([
			[0, 2],
			[2, 3],
			[3, 7],
		]);
		expect(main.elements.map((element) => seconds(element.trimStart))).toEqual([0, 2, 6]);
		expect(
			main.elements.map((element) => (element.type === "video" ? element.retime : undefined)),
		).toEqual([undefined, { rate: 4, maintainPitch: true }, undefined]);
		expect(main.elements[0].id).toBe("v");
	});

	test("원본 없는 요소는 시작과 끝을 줄어든 구간에 맞춰 옮긴다", () => {
		expect(subs.elements.map((element) => [element.id, ...span(element)])).toEqual([
			["a", 1, 2],
			["d", 2.125, 2.375],
			["b", 2.375, 2.625],
			["e", 2.625, 2.875],
			["c", 2.875, 4.5],
		]);
	});

	test("배경음악은 그대로 둔다", () => {
		expect(bgm).toBe(music);
	});
});

describe("sourceCutsToTimeline", () => {
	test("앞을 잘라 낸 클립과 2배속 클립에서도 타임라인 위치를 맞춘다", () => {
		const element = video({
			startTime: t({ seconds: 10 }),
			trimStart: t({ seconds: 4 }),
			retime: { rate: 2 },
		});
		const ranges = sourceCutsToTimeline({
			element,
			cuts: [
				{ start: 6, end: 8 },
				{ start: 0, end: 2 },
				{ start: 23, end: 30 },
			],
			fps: floatToFrameRate(30),
		});
		expect(ranges.map((range) => [seconds(range.start), seconds(range.end)])).toEqual([
			[11, 12],
			[19.5, 20],
		]);
	});
});

describe("collectSubtitleWords", () => {
	test("클립 위 자막의 단어를 소스 시간으로 옮기고 클립 밖 자막은 뺀다", () => {
		const element = video({
			startTime: t({ seconds: 10 }),
			trimStart: t({ seconds: 4 }),
			retime: { rate: 2 },
		});
		const words = collectSubtitleWords({
			element,
			tracks: [
				{
					id: "subs",
					type: "text",
					name: "subs",
					hidden: false,
					elements: [
						caption({ id: "in", start: 11, length: 1, offsets: [0, 0.5] }),
						caption({ id: "out", start: 25, length: 1, offsets: [0] }),
					],
				},
			],
		});
		expect(words.map((word) => [word.start, word.end])).toEqual([
			[6, 7],
			[7, 8],
		]);
	});
});
