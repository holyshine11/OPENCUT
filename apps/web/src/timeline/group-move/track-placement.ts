import type { SceneTracks, TimelineTrack } from "@/timeline";

export interface TrackPlacement {
	trackId: string;
	trackType: TimelineTrack["type"];
	displayIndex: number;
}

export function getDisplayTracks({
	tracks,
}: {
	tracks: SceneTracks;
}): TimelineTrack[] {
	return tracks;
}

export function getTrackPlacementById({
	tracks,
	trackId,
}: {
	tracks: SceneTracks;
	trackId: string;
}): TrackPlacement | null {
	const displayIndex = tracks.findIndex((track) => track.id === trackId);
	if (displayIndex < 0) {
		return null;
	}

	return { trackId, trackType: tracks[displayIndex].type, displayIndex };
}

export function getTrackPlacementByDisplayIndex({
	tracks,
	displayIndex,
}: {
	tracks: SceneTracks;
	displayIndex: number;
}): TrackPlacement | null {
	const track = tracks[displayIndex];
	return track
		? { trackId: track.id, trackType: track.type, displayIndex }
		: null;
}
