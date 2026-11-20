import { describe, expect, test } from "bun:test";
import type { AudioElement, SceneTracks, TextElement, VideoElement } from "@/timeline";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/wasm";
import { fitToLong, readLongCut } from "../long-cut";
import type { EditBeat } from "../plan";

const time = (seconds: number) => mediaTimeFromSeconds({ seconds });
const base = { trimEnd: ZERO_MEDIA_TIME, params: {} };

const video = ({ media, at, from, length, mosaic }: { media: string; at: number; from: number; length: number; mosaic?: boolean }): VideoElement => ({
	...base,
	id: `v-${at}`,
	type: "video",
	name: media,
	mediaId: media,
	startTime: time(at),
	trimStart: time(from),
	duration: time(length),
	...(mosaic
		? {
				masks: [
					{
						id: "m",
						type: "rectangle",
						fill: "mosaic",
						params: { centerX: 0, centerY: -0.25, width: 0.2, height: 0.2, rotation: 0, scale: 1, feather: 0, inverted: false, strokeColor: "", strokeWidth: 0, strokeAlign: "inside" },
					},
				],
			}
		: {}),
});
const voice = ({ at, text, who = "아내" }: { at: number; text: string; who?: string }): AudioElement => ({
	...base,
	id: `a-${at}`,
	type: "audio",
	sourceType: "upload",
	mediaId: `tts-${at}`,
	name: "tts",
	startTime: time(at),
	trimStart: ZERO_MEDIA_TIME,
	duration: time(1),
	tts: { text, voice: who, style: "", speed: 1.2, strength: 1, expressiveness: 1, model: "", lineId: `l-${at}` },
});
const caption = ({ at, text }: { at: number; text: string }): TextElement => ({
	...base,
	id: `t-${at}`,
	type: "text",
	name: text,
	startTime: time(at),
	trimStart: ZERO_MEDIA_TIME,
	duration: time(1),
	params: { content: text },
});

const beat = ({ clip, start, end }: { clip: string; start: number; end: number }): EditBeat => ({
	clip, start, end, narration: "", voice: "wife", caption: "", transition: null, sfx: null, sfxOn: "", impact: null, mosaic: [],
});

describe("readLongCut", () => {
	test("영상 컷마다 그 안에서 시작하는 내레이션·자막을 붙이고, 모자이크와 남편 목소리를 읽는다", () => {
		const tracks: SceneTracks = [
			{
				id: "v", name: "v", type: "video", muted: false, hidden: false,
				elements: [video({ media: "m2", at: 3, from: 10, length: 4, mosaic: true }), video({ media: "m1", at: 0, from: 1, length: 3 })],
			},
			{
				id: "a", name: "a", type: "audio", muted: false,
				elements: [voice({ at: 0.1, text: "어묵탕입니다" }), voice({ at: 0.3, text: "옆집" }), voice({ at: 3.2, text: "꼬치만 사 왔거든?", who: "남편" }), voice({ at: 4, text: "무는 통째로" })],
			},
			{ id: "t", name: "t", type: "text", hidden: false, elements: [caption({ at: 0, text: "어묵탕" }), caption({ at: 3.5, text: "무는 통째로" })] },
		];
		const long = readLongCut({ tracks, clipOf: { m1: "c01", m2: "c02" } });
		expect(long.map(({ clip, start, end }) => [clip, start, end])).toEqual([["c01", 1, 4], ["c02", 10, 14]]);
		expect(long[0].narration).toBe("어묵탕입니다 옆집");
		expect(long[0].caption).toBe("어묵탕");
		expect(long[1].voice).toBe("husband");
		expect(long[1].narration).toBe("꼬치만 사 왔거든? 무는 통째로");
		const [box] = long[1].mosaic;
		expect([box.x, box.y, box.w, box.h].map((value) => Number(value.toFixed(2)))).toEqual([0.4, 0.15, 0.2, 0.2]);
	});
});

describe("fitToLong", () => {
	const long = [
		{ clip: "c01", start: 1, end: 4, narration: "", voice: "wife" as const, caption: "", mosaic: [] },
		{ clip: "c02", start: 10, end: 14, narration: "", voice: "wife" as const, caption: "", mosaic: [{ x: 0.4, y: 0.1, w: 0.2, h: 0.2 }] },
	];
	test("롱폼 구간 밖은 잘라 내고, 롱폼에 없던 구간과 클립은 버리고, 모자이크를 옮긴다", () => {
		const fitted = fitToLong({
			beats: [
				beat({ clip: "c01", start: 0, end: 2.5 }),
				beat({ clip: "c02", start: 12, end: 16 }),
				beat({ clip: "c01", start: 6, end: 8 }),
				beat({ clip: "c03", start: 0, end: 2 }),
			],
			long,
		});
		expect(fitted.map(({ clip, start, end }) => [clip, start, end])).toEqual([["c01", 1, 2.5], ["c02", 12, 14]]);
		expect(fitted[0].mosaic).toEqual([]);
		expect(fitted[1].mosaic).toEqual([{ x: 0.4, y: 0.1, w: 0.2, h: 0.2 }]);
	});
});
