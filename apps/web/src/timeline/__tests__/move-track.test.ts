import { describe, expect, test } from "bun:test";
import type {
	AudioTrack,
	SceneTracks,
	TextTrack,
	VideoTrack,
} from "@/timeline";
import { moveTrack } from "@/timeline/track-folders";

const text = ({
	id,
	folderId,
}: {
	id: string;
	folderId?: string;
}): TextTrack => ({
	id,
	name: id,
	type: "text",
	elements: [],
	hidden: false,
	folderId,
});
const audio = (id: string): AudioTrack => ({
	id,
	name: id,
	type: "audio",
	elements: [],
	muted: false,
});
const video = (id: string): VideoTrack => ({
	id,
	name: id,
	type: "video",
	elements: [],
	muted: false,
	hidden: false,
});
const ids = (tracks: SceneTracks | undefined) =>
	tracks ? tracks.map(({ id }) => id) : null;
const folderIds = (tracks: SceneTracks | undefined) =>
	tracks?.map(({ id, folderId }) => [id, folderId]);

describe("moveTrack", () => {
	test("moves a track down and up", () => {
		const tracks = [text({ id: "a" }), text({ id: "b" }), text({ id: "c" })];
		expect(
			ids(moveTrack({ tracks, folders: [], trackId: "a", toIndex: 3 })?.tracks),
		).toEqual(["b", "c", "a"]);
		expect(
			ids(moveTrack({ tracks, folders: [], trackId: "c", toIndex: 0 })?.tracks),
		).toEqual(["c", "a", "b"]);
	});

	test("moves any kind of track anywhere", () => {
		const tracks = [text({ id: "t" }), video("v"), audio("x")];
		expect(
			ids(moveTrack({ tracks, folders: [], trackId: "x", toIndex: 0 })?.tracks),
		).toEqual(["x", "t", "v"]);
		expect(
			ids(moveTrack({ tracks, folders: [], trackId: "t", toIndex: 3 })?.tracks),
		).toEqual(["v", "x", "t"]);
	});

	test("refuses unknown tracks and no-op moves", () => {
		const tracks = [text({ id: "a" }), text({ id: "b" })];
		expect(
			moveTrack({ tracks, folders: [], trackId: "z", toIndex: 0 }),
		).toBeNull();
		expect(
			moveTrack({ tracks, folders: [], trackId: "a", toIndex: 1 }),
		).toBeNull();
	});

	test("keeps folders contiguous", () => {
		const folders = [{ id: "f", name: "F" }];
		const tracks = [
			text({ id: "a", folderId: "f" }),
			text({ id: "b", folderId: "f" }),
			text({ id: "c" }),
		];
		// 폴더 밖으로 나가면 폴더에서 빠진다
		expect(
			folderIds(
				moveTrack({ tracks, folders, trackId: "a", toIndex: 3 })?.tracks,
			),
		).toEqual([
			["b", "f"],
			["c", undefined],
			["a", undefined],
		]);
		// 두 구성원 사이로 들어오면 폴더에 든다
		expect(
			folderIds(
				moveTrack({ tracks, folders, trackId: "c", toIndex: 1 })?.tracks,
			),
		).toEqual([
			["a", "f"],
			["c", "f"],
			["b", "f"],
		]);
	});

	test("drops a folder left without members", () => {
		const folders = [{ id: "f", name: "F" }];
		const tracks = [
			text({ id: "a", folderId: "f" }),
			text({ id: "b" }),
			text({ id: "c" }),
		];
		expect(
			moveTrack({ tracks, folders, trackId: "a", toIndex: 3 })?.trackFolders,
		).toEqual([]);
	});
});
