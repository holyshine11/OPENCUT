import { describe, expect, test } from "bun:test";
import type { TextElement, VideoElement } from "@/timeline/types";
import { floatToFrameRate } from "@/fps/utils";
import { mediaTimeFromSeconds as t, TICKS_PER_SECOND, ZERO_MEDIA_TIME } from "@/wasm";
import { splitElementAtTimes } from "@/timeline/split-element";
import { collectSubtitleWords, sourcePointsToTimeline } from "../apply";

const seconds = (ticks: number) => Number((ticks / TICKS_PER_SECOND).toFixed(3));

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
	content = "",
}: {
	id: string;
	start: number;
	length: number;
	offsets?: number[];
	content?: string;
}): TextElement {
	return {
		id,
		type: "text",
		name: id,
		startTime: t({ seconds: start }),
		duration: t({ seconds: length }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: { content },
		subtitleWordOffsets: offsets,
	};
}

const span = (element: { startTime: number; duration: number }) => [
	seconds(element.startTime),
	seconds(element.startTime + element.duration),
];

const fps = floatToFrameRate(30);

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
						caption({ id: "in", start: 11, length: 1, offsets: [0, 0.5], content: "음, 그래서" }),
						caption({ id: "out", start: 25, length: 1, offsets: [0] }),
					],
				},
			],
		});
		expect(words.map((word) => [word.start, word.end, word.text])).toEqual([
			[6, 7, "음,"],
			[7, 8, "그래서"],
		]);
	});
});

describe("splitElementAtTimes", () => {
	test("여러 시각에서 차례로 나누고, 이름은 그대로, 첫 조각이 원래 id를 지킨다", () => {
		const pieces = splitElementAtTimes({
			element: video(),
			times: [t({ seconds: 7 }), t({ seconds: 3 }), t({ seconds: 3 }), t({ seconds: 12 })],
		});
		expect(pieces.map(span)).toEqual([
			[0, 3],
			[3, 7],
			[7, 10],
		]);
		expect(pieces.map((piece) => seconds(piece.trimStart))).toEqual([0, 3, 7]);
		expect(pieces.map((piece) => piece.name)).toEqual(["clip", "clip", "clip"]);
		expect(pieces[0].id).toBe("v");
	});
});

describe("sourcePointsToTimeline", () => {
	test("2배속 클립의 소스 시각을 타임라인으로 옮기고 클립 경계와 밖은 버린다", () => {
		const element = video({ startTime: t({ seconds: 1 }), trimStart: t({ seconds: 2 }), duration: t({ seconds: 4 }), retime: { rate: 2 } });
		const points = sourcePointsToTimeline({
			element,
			points: [{ time: 2 }, { time: 4 }, { time: 10 }, { time: 11 }],
			fps,
		});
		expect(points.map((point) => seconds(point.time))).toEqual([2]);
	});
});
