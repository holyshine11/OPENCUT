import { describe, expect, test } from "bun:test";
import { transformProjectV31ToV32 } from "../transformers/v31-to-v32";
import { asRecord, asRecordArray } from "./helpers";

const legacyTracks = {
	overlay: [{ id: "text", type: "text", elements: [] }],
	main: { id: "main", type: "video", elements: [{ id: "clip" }] },
	audio: [{ id: "music", type: "audio", elements: [] }],
};

describe("V31 to V32 Migration", () => {
	test("adds trackList in display order and keeps the old tracks", () => {
		const result = transformProjectV31ToV32({
			project: { id: "p", version: 31, scenes: [{ tracks: legacyTracks }] },
		});

		expect(result.skipped).toBe(false);
		expect(result.project.version).toBe(32);
		const scene = asRecordArray(result.project.scenes)[0];
		expect(
			asRecordArray(scene.trackList).map((track) => asRecord(track).id),
		).toEqual(["text", "main", "music"]);
		expect(scene.tracks).toEqual(legacyTracks);
	});

	test("drops an empty main track from trackList", () => {
		const result = transformProjectV31ToV32({
			project: {
				id: "p",
				version: 31,
				scenes: [
					{
						tracks: {
							...legacyTracks,
							main: { ...legacyTracks.main, elements: [] },
						},
					},
				],
			},
		});
		const scene = asRecordArray(result.project.scenes)[0];
		expect(
			asRecordArray(scene.trackList).map((track) => asRecord(track).id),
		).toEqual(["text", "music"]);
	});

	test("skips projects that are not v31", () => {
		expect(
			transformProjectV31ToV32({ project: { id: "p", version: 30 } }).skipped,
		).toBe(true);
	});
});
