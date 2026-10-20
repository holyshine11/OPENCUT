import { describe, expect, test } from "bun:test";
import type {
	AudioTrack,
	SceneTracks,
	TextTrack,
	TrackFolder,
	VideoTrack,
} from "@/timeline";
import {
	getFolderMembers,
	getFolderToggleState,
	getGroupableTrackIds,
	getTrackFolderRows,
	groupTracksIntoFolder,
	ungroupFolder,
} from "@/timeline/track-folders";
import { getTrackRowLayouts } from "@/timeline/components/track-layout";
import {
	TIMELINE_FOLDER_HEADER_HEIGHT_PX,
	TIMELINE_TRACK_GAP_PX,
	TIMELINE_TRACK_HEIGHTS_PX,
} from "@/timeline/components/layout";

function textTrack({
	id,
	folderId,
}: {
	id: string;
	folderId?: string;
}): TextTrack {
	return { id, name: id, type: "text", elements: [], hidden: false, folderId };
}

const main: VideoTrack = {
	id: "main",
	name: "main",
	type: "video",
	elements: [],
	muted: false,
	hidden: false,
};

const audio: AudioTrack = {
	id: "music",
	name: "music",
	type: "audio",
	elements: [],
	muted: true,
};

const sceneTracks: SceneTracks = [
	textTrack({ id: "a" }),
	textTrack({ id: "b" }),
	textTrack({ id: "c" }),
	main,
	audio,
];

const folder: TrackFolder = { id: "f", name: "folder" };

describe("track folders", () => {
	test("grouping fills the range between picked tracks", () => {
		const result = groupTracksIntoFolder({
			tracks: sceneTracks,
			folders: undefined,
			trackIds: ["c", "a"],
			folder,
		});
		expect(result?.trackFolders).toEqual([folder]);
		expect(
			getFolderMembers({ tracks: result!.tracks, folderId: "f" }).map(
				({ id }) => id,
			),
		).toEqual(["a", "b", "c"]);
	});

	test("tracks already in a folder are not grouped again", () => {
		const tracks = [
			textTrack({ id: "a", folderId: "f" }),
			textTrack({ id: "b" }),
		];
		expect(
			getGroupableTrackIds({ tracks, folders: [folder], trackIds: ["a", "b"] }),
		).toBeNull();
		// 지워진 폴더를 가리키는 트랙은 폴더 밖으로 본다
		expect(
			getGroupableTrackIds({ tracks, folders: [], trackIds: ["a", "b"] }),
		).toEqual(["a", "b"]);
	});

	test("ungrouping clears members and drops the folder", () => {
		const grouped = groupTracksIntoFolder({
			tracks: sceneTracks,
			folders: undefined,
			trackIds: ["a", "b"],
			folder,
		})!;
		const result = ungroupFolder({
			tracks: grouped.tracks,
			folders: grouped.trackFolders,
			folderId: "f",
		});
		expect(result.trackFolders).toEqual([]);
		expect(getFolderMembers({ tracks: result.tracks, folderId: "f" })).toEqual(
			[],
		);
	});

	test("header sits on the first member and collapse hides members", () => {
		const tracks = [
			textTrack({ id: "x" }),
			textTrack({ id: "a", folderId: "f" }),
			textTrack({ id: "b", folderId: "f" }),
		];
		expect(getTrackFolderRows({ tracks, folders: [folder] })).toEqual([
			{ header: null, hidden: false },
			{ header: folder, hidden: false },
			{ header: null, hidden: false },
		]);

		const collapsed = { ...folder, collapsed: true };
		const folderRows = getTrackFolderRows({ tracks, folders: [collapsed] });
		expect(folderRows.map(({ hidden }) => hidden)).toEqual([false, true, true]);

		const text = TIMELINE_TRACK_HEIGHTS_PX.text;
		const { rows, totalHeight } = getTrackRowLayouts({ tracks, folderRows });
		expect(rows[1].folderHeaderTop).toBe(text + TIMELINE_TRACK_GAP_PX);
		expect(rows[1].hidden).toBe(true);
		expect(rows[2].height).toBe(0);
		expect(totalHeight).toBe(
			text + TIMELINE_TRACK_GAP_PX + TIMELINE_FOLDER_HEADER_HEIGHT_PX,
		);
	});

	test("layout without folders keeps the old track positions", () => {
		const tracks = [textTrack({ id: "a" }), main];
		const { rows, totalHeight } = getTrackRowLayouts({ tracks });
		expect(rows[1].top).toBe(
			TIMELINE_TRACK_HEIGHTS_PX.text + TIMELINE_TRACK_GAP_PX,
		);
		expect(totalHeight).toBe(
			TIMELINE_TRACK_HEIGHTS_PX.text +
				TIMELINE_TRACK_GAP_PX +
				TIMELINE_TRACK_HEIGHTS_PX.video,
		);
	});

	test("folder toggles are on only when every applicable member is", () => {
		expect(getFolderToggleState({ members: [main, audio] })).toEqual({
			muted: false,
			hidden: false,
			locked: false,
		});
		expect(
			getFolderToggleState({ members: [audio, { ...main, muted: true }] }),
		).toEqual({ muted: true, hidden: false, locked: false });
		// 오디오 트랙은 숨길 수 없다
		expect(getFolderToggleState({ members: [audio] }).hidden).toBeNull();
	});
});
