import type { SceneTracks, TimelineTrack, TrackFolder } from "@/timeline";
import { canTrackBeHidden, canTrackHaveAudio } from "./track-capabilities";

export interface TrackFolderRow {
	/** 이 트랙 위에 머리 줄을 그릴 폴더. 폴더의 첫 트랙에만 붙는다 */
	header: TrackFolder | null;
	/** 접힌 폴더의 트랙. 줄을 그리지 않는다 */
	hidden: boolean;
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
	return tracks.map(update);
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
		tracks: tracks,
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
	return tracks.filter((track) => track.folderId === folderId);
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

/**
 * 트랙을 다른 자리로 옮긴다. toIndex는 옮기기 전 목록에서 끼워 넣을 자리다. 폴더 구성원은 늘 붙어 있어야 해서,
 * 같은 폴더 트랙 옆에 남으면 그 폴더에 두고, 한 폴더의 두 트랙 사이에 들어가면 그 폴더에 넣고,
 * 아니면 폴더에서 뺀다. 구성원이 없어진 폴더는 지운다
 */
export function moveTrack({
	tracks,
	folders,
	trackId,
	toIndex,
}: {
	tracks: SceneTracks;
	folders: readonly TrackFolder[] | undefined;
	trackId: string;
	toIndex: number;
}): { tracks: SceneTracks; trackFolders: TrackFolder[] } | null {
	const from = tracks.findIndex(({ id }) => id === trackId);
	const to = toIndex > from ? toIndex - 1 : toIndex;
	if (from < 0 || to === from || to < 0 || to >= tracks.length) return null;

	const rest = tracks.filter((_, index) => index !== from);
	const moved = [...rest.slice(0, to), tracks[from], ...rest.slice(to)];
	const folderOf = (track: TimelineTrack | undefined) =>
		findFolder({ folders, folderId: track?.folderId })?.id;
	const above = folderOf(moved[to - 1]);
	const below = folderOf(moved[to + 1]);
	const own = folderOf(moved[to]);
	const folderId =
		own && (own === above || own === below)
			? own
			: above && above === below
				? above
				: undefined;

	const next = mapTracks({
		tracks: moved,
		update: (track) => (track.id === trackId ? { ...track, folderId } : track),
	});
	const usedFolderIds = new Set(next.map((track) => track.folderId));
	return {
		tracks: next,
		trackFolders: (folders ?? []).filter(({ id }) => usedFolderIds.has(id)),
	};
}
