import { getDropLineY } from "./drop-target";
import type { TimelineTrack, DropTarget } from "@/timeline";
import type { TrackFolderRow } from "@/timeline/track-folders";
import { TIMELINE_LAYERS } from "./layers";

interface DragLineProps {
	dropTarget: DropTarget | null;
	tracks: TimelineTrack[];
	folderRows?: readonly TrackFolderRow[];
	isVisible: boolean;
	headerHeight?: number;
}

export function DragLine({
	dropTarget,
	tracks,
	folderRows,
	isVisible,
	headerHeight = 0,
}: DragLineProps) {
	if (!isVisible || !dropTarget) return null;

	const y = getDropLineY({ dropTarget, tracks, folderRows });
	const lineTop = y + headerHeight;

	return (
		<div
			className="bg-primary pointer-events-none absolute right-0 left-0 h-0.5"
			style={{ top: `${lineTop}px`, zIndex: TIMELINE_LAYERS.dragLine }}
		/>
	);
}
