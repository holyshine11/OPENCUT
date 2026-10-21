import { describe, expect, test } from "bun:test";
import type { AudioElement, AudioTrack, TextElement, TextTrack } from "@/timeline";
import { mediaTime, ZERO_MEDIA_TIME } from "@/wasm";
import { findLineCaptions, isLineStale, rippleLineUpdates } from "../lines";
import { fitTtsTargets, pickTtsTargets } from "../targets";

const TTS = {
	text: "",
	voice: "v",
	style: "s",
	speed: 1,
	strength: 100,
	expressiveness: 50,
	model: "m",
};

function audio({
	id,
	start = 0,
	duration = 10,
	lineId,
}: {
	id: string;
	start?: number;
	duration?: number;
	lineId?: string;
}): AudioElement {
	return {
		id,
		type: "audio",
		sourceType: "upload",
		mediaId: `media-${id}`,
		name: id,
		startTime: mediaTime({ ticks: start }),
		duration: mediaTime({ ticks: duration }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
		...(lineId ? { tts: { ...TTS, lineId } } : {}),
	};
}

function caption({
	id,
	start = 0,
	duration = 10,
	content = "자막",
	lineId,
}: {
	id: string;
	start?: number;
	duration?: number;
	content?: string;
	lineId?: string;
}): TextElement {
	return {
		id,
		type: "text",
		name: id,
		startTime: mediaTime({ ticks: start }),
		duration: mediaTime({ ticks: duration }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: { content },
		...(lineId ? { ttsLineId: lineId } : {}),
	};
}

function audioTrack({
	id,
	elements = [],
	locked,
}: {
	id: string;
	elements?: AudioElement[];
	locked?: boolean;
}): AudioTrack {
	return { id, name: "Audio track", type: "audio", elements, muted: false, locked };
}

function textTrack({ id, elements = [] }: { id: string; elements?: TextElement[] }): TextTrack {
	return { id, name: "Text track", type: "text", elements, hidden: false };
}

const span = ({ start, duration }: { start: number; duration: number }) => ({
	startTime: mediaTime({ ticks: start }),
	duration: mediaTime({ ticks: duration }),
});

describe("pickTtsTargets", () => {
	const tracks = [
		textTrack({ id: "t1", elements: [caption({ id: "c1", lineId: "L1" })] }),
		textTrack({ id: "t2" }),
		audioTrack({ id: "a1", elements: [audio({ id: "x1", lineId: "L1" })] }),
		audioTrack({ id: "a2", elements: [audio({ id: "x2" })] }),
		audioTrack({ id: "a3", locked: true, elements: [audio({ id: "x3", lineId: "L3" })] }),
	];

	test("아무것도 고르지 않으면 대본 읽기 음성이 있는 가장 아래 트랙과 이어진 자막 트랙", () => {
		expect(pickTtsTargets({ tracks, selectedTrackIds: [], selectedElements: [] })).toEqual({
			audioTrackId: "a1",
			captionTrackId: "t1",
		});
	});

	test("고른 오디오 트랙이 먼저이고, 그 트랙에 이어진 자막이 없으면 고른 텍스트 트랙", () => {
		expect(
			pickTtsTargets({ tracks, selectedTrackIds: ["t2", "a2"], selectedElements: [] }),
		).toEqual({ audioTrackId: "a2", captionTrackId: "t2" });
	});

	test("고른 트랙이 없으면 고른 클립의 트랙", () => {
		expect(
			pickTtsTargets({
				tracks,
				selectedTrackIds: [],
				selectedElements: [{ trackId: "a2", elementId: "x2" }],
			}),
		).toEqual({ audioTrackId: "a2", captionTrackId: null });
	});

	test("잠긴 트랙은 고르지 않고, 대본 읽기 트랙이 없으면 새 트랙", () => {
		expect(
			pickTtsTargets({
				tracks: [audioTrack({ id: "a3", locked: true, elements: [audio({ id: "x", lineId: "L" })] })],
				selectedTrackIds: ["a3"],
				selectedElements: [],
			}),
		).toEqual({ audioTrackId: null, captionTrackId: null });
	});
});

describe("fitTtsTargets", () => {
	const tracks = [
		textTrack({ id: "t1", elements: [caption({ id: "c1", start: 0, duration: 10 })] }),
		audioTrack({ id: "a1", elements: [audio({ id: "x1", start: 0, duration: 10 })] }),
	];
	const targets = { audioTrackId: "a1", captionTrackId: "t1" };

	test("기존 클립 끝부터 넣으면 그대로 쓴다", () => {
		expect(
			fitTtsTargets({ tracks, targets, audioSpans: [span({ start: 10, duration: 5 })], captionSpans: [span({ start: 10, duration: 5 })] }),
		).toEqual({ ...targets, audioMoved: false, captionsMoved: false });
	});

	test("겹치는 종류만 새 트랙으로 보낸다", () => {
		expect(
			fitTtsTargets({ tracks, targets, audioSpans: [span({ start: 5, duration: 5 })], captionSpans: [span({ start: 10, duration: 5 })] }),
		).toEqual({ audioTrackId: null, captionTrackId: "t1", audioMoved: true, captionsMoved: false });
	});

	test("지워진 트랙은 알리지 않고 새 트랙, 자막이 없으면 자막 트랙도 없다", () => {
		expect(
			fitTtsTargets({
				tracks,
				targets: { audioTrackId: "gone", captionTrackId: "t1" },
				audioSpans: [span({ start: 0, duration: 5 })],
				captionSpans: [],
			}),
		).toEqual({ audioTrackId: null, captionTrackId: null, audioMoved: false, captionsMoved: false });
	});
});

describe("isLineStale", () => {
	const captionsOf = (...contents: string[]) =>
		findLineCaptions({
			tracks: [
				textTrack({
					id: "t",
					// 일부러 시간 역순으로 넣는다. 시작 시간순으로 이어 붙여야 한다
					elements: contents
						.map((content, index) =>
							caption({ id: `c${index}`, start: index * 10, content, lineId: "L" }),
						)
						.reverse(),
				}),
			],
			lineId: "L",
		});

	test("숏폼처럼 마침표·쉼표를 빼고 줄을 나눈 새 자막은 낡지 않았다", () => {
		expect(
			isLineStale({
				text: "양파는 채 썰고, 당근은 깍둑 썰어요.",
				captions: captionsOf("양파는 채\n썰고", "당근은 깍둑 썰어요"),
			}),
		).toBe(false);
	});

	test("문장부호를 남긴 롱폼 자막도 낡지 않았다", () => {
		expect(
			isLineStale({ text: "정말요? 네!", captions: captionsOf("정말요? 네!") }),
		).toBe(false);
	});

	test("글자를 고치면 낡았다", () => {
		expect(
			isLineStale({ text: "양파를 썰어요.", captions: captionsOf("대파를 썰어요") }),
		).toBe(true);
	});

	test("자막이 없으면 비교하지 않는다", () => {
		expect(isLineStale({ text: "양파를 썰어요.", captions: [] })).toBe(false);
	});
});

describe("rippleLineUpdates", () => {
	const tracks = [
		textTrack({
			id: "t",
			elements: [caption({ id: "c-before", start: 0 }), caption({ id: "c-after", start: 20 })],
		}),
		audioTrack({
			id: "a",
			elements: [audio({ id: "line", start: 0, duration: 20 }), audio({ id: "next", start: 25 })],
		}),
		audioTrack({ id: "other", elements: [audio({ id: "untouched", start: 30 })] }),
	];

	test("고른 트랙에서 옛 끝 이후에 시작하는 클립만 delta만큼 옮긴다", () => {
		const updates = rippleLineUpdates({
			tracks,
			trackIds: ["a", "t"],
			afterTime: mediaTime({ ticks: 20 }),
			delta: 7,
		});
		expect(
			updates.map(({ elementId, patch }) => [elementId, Number(patch.startTime)]),
		).toEqual([
			["c-after", 27],
			["next", 32],
		]);
	});

	test("짧아지면 당기고, 길이가 같으면 아무것도 옮기지 않는다", () => {
		const shorter = rippleLineUpdates({
			tracks,
			trackIds: ["a"],
			afterTime: mediaTime({ ticks: 20 }),
			delta: -5,
		});
		expect(shorter.map(({ patch }) => Number(patch.startTime))).toEqual([20]);
		expect(
			rippleLineUpdates({ tracks, trackIds: ["a"], afterTime: mediaTime({ ticks: 20 }), delta: 0 }),
		).toEqual([]);
	});
});
