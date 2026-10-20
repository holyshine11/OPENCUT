import type { ElementRef, ElementType, TrackType } from "@/timeline";
import type { MediaTime } from "@/wasm";

export interface GroupMember extends ElementRef {
	elementType: ElementType;
	duration: MediaTime;
	timeOffset: MediaTime;
	displayIndex: number;
}

export interface MoveGroup {
	anchor: GroupMember;
	members: GroupMember[];
}

export interface PlannedTrackCreation {
	id: string;
	type: TrackType;
	index: number;
}

export interface PlannedElementMove {
	sourceTrackId: string;
	targetTrackId: string;
	elementId: string;
	newStartTime: MediaTime;
}

export interface GroupMoveResult {
	moves: PlannedElementMove[];
	createTracks: PlannedTrackCreation[];
	targetSelection: ElementRef[];
}
