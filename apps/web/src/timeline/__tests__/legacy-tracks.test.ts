import { describe, expect, test } from "bun:test";
import type { AudioTrack, TextTrack, VideoTrack } from "@/timeline";
import {
	fromLegacySceneTracks,
	toLegacySceneTracks,
} from "@/timeline/legacy-tracks";

// 변환은 클립 개수만 보므로 클립 내용은 비워 둔다
const clip: VideoTrack["elements"][number] = JSON.parse('{"id":"clip"}');
const video = ({
	id,
	withClip = false,
}: {
	id: string;
	withClip?: boolean;
}): VideoTrack => ({
	id,
	name: id,
	type: "video",
	elements: withClip ? [clip] : [],
	muted: false,
	hidden: false,
});
const text: TextTrack = {
	id: "t",
	name: "t",
	type: "text",
	elements: [],
	hidden: false,
};
const audio: AudioTrack = {
	id: "a",
	name: "a",
	type: "audio",
	elements: [],
	muted: false,
};

describe("legacy scene tracks", () => {
	test("flattens overlay, non-empty main and audio in display order", () => {
		const tracks = fromLegacySceneTracks({
			tracks: {
				overlay: [text],
				main: video({ id: "m", withClip: true }),
				audio: [audio],
			},
		});
		expect(tracks.map(({ id }) => id)).toEqual(["t", "m", "a"]);
	});

	test("drops an empty main track and tolerates malformed data", () => {
		expect(
			fromLegacySceneTracks({
				tracks: { overlay: [text], main: video({ id: "m" }), audio: [audio] },
			}).map(({ id }) => id),
		).toEqual(["t", "a"]);
		expect(fromLegacySceneTracks({ tracks: null })).toEqual([]);
	});

	test("folds back using the bottom video track as main", () => {
		const legacy = toLegacySceneTracks({
			tracks: [
				video({ id: "v1", withClip: true }),
				text,
				video({ id: "v2", withClip: true }),
				audio,
			],
			sceneId: "s",
		});
		expect(legacy.main.id).toBe("v2");
		expect(legacy.overlay.map(({ id }) => id)).toEqual(["v1", "t"]);
		expect(legacy.audio.map(({ id }) => id)).toEqual(["a"]);
	});

	test("creates an empty main when there is no video track", () => {
		const legacy = toLegacySceneTracks({ tracks: [text], sceneId: "s" });
		expect(legacy.main).toMatchObject({ id: "s:main", elements: [] });
		expect(legacy.overlay.map(({ id }) => id)).toEqual(["t"]);
	});
});
