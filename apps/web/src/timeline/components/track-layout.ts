import type { TrackType } from "@/timeline";
import type { TrackFolderRow } from "@/timeline/track-folders";
import {
	KEYFRAME_LANE_HEIGHT_PX,
	TIMELINE_FOLDER_HEADER_HEIGHT_PX,
	TIMELINE_TRACK_GAP_PX,
	TIMELINE_TRACK_HEIGHTS_PX,
} from "./layout";

export function getTrackHeight({ type }: { type: TrackType }): number {
	return TIMELINE_TRACK_HEIGHTS_PX[type];
}

export function getExpandedTrackHeight({
	type,
	expandedLaneCount,
}: {
	type: TrackType;
	expandedLaneCount: number;
}): number {
	return (
		TIMELINE_TRACK_HEIGHTS_PX[type] +
		expandedLaneCount * KEYFRAME_LANE_HEIGHT_PX
	);
}

export interface TrackRowLayout {
	top: number;
	height: number;
	/** 접힌 폴더 안이라 그리지 않는 줄. 높이 0 */
	hidden: boolean;
	/** 이 줄 위에 붙는 폴더 머리 줄의 top */
	folderHeaderTop: number | null;
}

/** 트랙 줄 위치를 한 번에 계산한다. 그리기·끌어 놓기·범위 선택이 모두 이 결과를 쓴다 */
export function getTrackRowLayouts({
	tracks,
	getExtraHeight,
	folderRows,
}: {
	tracks: Array<{ type: TrackType }>;
	getExtraHeight?: (trackIndex: number) => number;
	folderRows?: readonly TrackFolderRow[];
}): { rows: TrackRowLayout[]; totalHeight: number } {
	let y = 0;
	let hasRow = false;
	const place = (height: number) => {
		if (hasRow) y += TIMELINE_TRACK_GAP_PX;
		hasRow = true;
		const top = y;
		y += height;
		return top;
	};

	const rows = tracks.map((track, i) => {
		const folderRow = folderRows?.[i];
		const folderHeaderTop = folderRow?.header
			? place(TIMELINE_FOLDER_HEADER_HEIGHT_PX)
			: null;
		if (folderRow?.hidden) {
			return {
				top: hasRow ? y + TIMELINE_TRACK_GAP_PX : y,
				height: 0,
				hidden: true,
				folderHeaderTop,
			};
		}
		const height =
			getTrackHeight({ type: track.type }) + (getExtraHeight?.(i) ?? 0);
		return { top: place(height), height, hidden: false, folderHeaderTop };
	});

	return { rows, totalHeight: y };
}

export function getCumulativeHeightBefore({
	tracks,
	trackIndex,
	getExtraHeight,
	folderRows,
}: {
	tracks: Array<{ type: TrackType }>;
	trackIndex: number;
	getExtraHeight?: (trackIndex: number) => number;
	folderRows?: readonly TrackFolderRow[];
}): number {
	const { rows, totalHeight } = getTrackRowLayouts({
		tracks,
		getExtraHeight,
		folderRows,
	});
	// 마지막 줄 뒤는 다음 줄이 올 자리
	if (trackIndex < rows.length) return rows[trackIndex].top;
	return rows.length > 0 ? totalHeight + TIMELINE_TRACK_GAP_PX : 0;
}

export function getTotalTracksHeight({
	tracks,
	getExtraHeight,
	folderRows,
}: {
	tracks: Array<{ type: TrackType }>;
	getExtraHeight?: (trackIndex: number) => number;
	folderRows?: readonly TrackFolderRow[];
}): number {
	return getTrackRowLayouts({ tracks, getExtraHeight, folderRows }).totalHeight;
}
