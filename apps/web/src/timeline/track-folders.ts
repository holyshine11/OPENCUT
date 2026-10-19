import type { SceneTracks, TimelineTrack, TrackFolder } from "@/timeline";
import { canTrackBeHidden, canTrackHaveAudio } from "./track-capabilities";

export interface TrackFolderRow {
	/** 이 트랙 위에 머리 줄을 그릴 폴더. 폴더의 첫 트랙에만 붙는다 */
	header: TrackFolder | null;
	/** 접힌 폴더의 트랙. 줄을 그리지 않는다 */
	hidden: boolean;
}

function orderedTracks(tracks: SceneTracks): TimelineTrack[] {
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}

function findFolder({
	folders,
	folderId,
}: {
	folders: readonly TrackFolder[] | undefined;
	folderId: string | undefined;
}): TrackFolder | null {
	if (!folderId) return null;
	return folders?.find((folder) => folder.id === folderId) ?? null;
}

/** 트랙 순서대로 폴더 머리 줄과 접혀 숨는 줄을 정한다 */
export function getTrackFolderRows({
	tracks,
	folders,
}: {
	tracks: readonly Pick<TimelineTrack, "folderId">[];
	folders: readonly TrackFolder[] | undefined;
}): TrackFolderRow[] {
	const seen = new Set<string>();
	return tracks.map(({ folderId }) => {
		const folder = findFolder({ folders, folderId });
		if (!folder) return { header: null, hidden: false };
		const header = seen.has(folder.id) ? null : folder;
		seen.add(folder.id);
		return { header, hidden: folder.collapsed === true };
	});
}

/**
 * 고른 트랙의 처음부터 끝까지 이어진 트랙을 폴더로 묶을 수 있으면 그 id를 돌려준다.
 * 사이에 낀 트랙도 함께 묶어 구성원이 늘 붙어 있게 한다. 이미 폴더에 든 트랙이 끼면 묶지 않는다
 */
export function getGroupableTrackIds({
	tracks,
	folders,
	trackIds,
}: {
	tracks: readonly Pick<TimelineTrack, "id" | "folderId">[];
	folders: readonly TrackFolder[] | undefined;
	trackIds: readonly string[];
}): string[] | null {
	const indices = trackIds
		.map((id) => tracks.findIndex((track) => track.id === id))
		.filter((index) => index >= 0);
	if (indices.length === 0) return null;

	const range = tracks.slice(Math.min(...indices), Math.max(...indices) + 1);
	if (range.some(({ folderId }) => findFolder({ folders, folderId }))) {
		return null;
	}
	return range.map(({ id }) => id);
}

function mapTracks({
	tracks,
	update,
}: {
	tracks: SceneTracks;
	update: <TTrack extends TimelineTrack>(track: TTrack) => TTrack;
}): SceneTracks {
	return {
		...tracks,
		overlay: tracks.overlay.map(update),
		main: update(tracks.main),
		audio: tracks.audio.map(update),
	};
}

export function groupTracksIntoFolder({
	tracks,
	folders,
	trackIds,
	folder,
}: {
	tracks: SceneTracks;
	folders: readonly TrackFolder[] | undefined;
	trackIds: readonly string[];
	folder: TrackFolder;
}): { tracks: SceneTracks; trackFolders: TrackFolder[] } | null {
	const memberIds = getGroupableTrackIds({
		tracks: orderedTracks(tracks),
		folders,
		trackIds,
	});
	if (!memberIds) return null;

	const members = new Set(memberIds);
	return {
		tracks: mapTracks({
			tracks,
			update: (track) =>
				members.has(track.id) ? { ...track, folderId: folder.id } : track,
		}),
		trackFolders: [...(folders ?? []), folder],
	};
}

export function ungroupFolder({
	tracks,
	folders,
	folderId,
}: {
	tracks: SceneTracks;
	folders: readonly TrackFolder[] | undefined;
	folderId: string;
}): { tracks: SceneTracks; trackFolders: TrackFolder[] } {
	return {
		tracks: mapTracks({
			tracks,
			update: (track) =>
				track.folderId === folderId ? { ...track, folderId: undefined } : track,
		}),
		trackFolders: (folders ?? []).filter((folder) => folder.id !== folderId),
	};
}

export function getFolderMembers({
	tracks,
	folderId,
}: {
	tracks: SceneTracks;
	folderId: string;
}): TimelineTrack[] {
	return orderedTracks(tracks).filter((track) => track.folderId === folderId);
}

/** 해당 트랙이 모두 음소거·숨김·잠금이면 true. 해당 트랙이 없으면 null */
export function getFolderToggleState({
	members,
}: {
	members: readonly TimelineTrack[];
}): { muted: boolean | null; hidden: boolean | null; locked: boolean | null } {
	const audible = members.filter(canTrackHaveAudio);
	const visible = members.filter(canTrackBeHidden);
	return {
		muted: audible.length ? audible.every((track) => track.muted) : null,
		hidden: visible.length ? visible.every((track) => track.hidden) : null,
		locked: members.length
			? members.every((track) => track.locked === true)
			: null,
	};
}
