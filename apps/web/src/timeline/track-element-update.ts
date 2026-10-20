import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";

export function findTrackInSceneTracks({
	tracks,
	trackId,
}: {
	tracks: SceneTracks;
	trackId: string;
}): TimelineTrack | null {
	return tracks.find((track) => track.id === trackId) ?? null;
}

export function updateTrackInSceneTracks({
	tracks,
	trackId,
	update,
}: {
	tracks: SceneTracks;
	trackId: string;
	update: <TTrack extends TimelineTrack>(track: TTrack) => TTrack;
}): SceneTracks {
	return tracks.map((track) => (track.id === trackId ? update(track) : track));
}

function updateElementInTrack<TTrack extends TimelineTrack>({
	track,
	elementId,
	update,
	elementPredicate,
}: {
	track: TTrack;
	elementId: string;
	update: (element: TimelineElement) => TimelineElement;
	elementPredicate?: (element: TimelineElement) => boolean;
}): TTrack {
	const nextElements = track.elements.map((element) => {
		if (element.id !== elementId) {
			return element;
		}
		if (elementPredicate && !elementPredicate(element)) {
			return element;
		}
		return update(element);
	});

	return {
		...track,
		elements: nextElements,
	} as TTrack;
}

export function updateElementInSceneTracks({
	tracks,
	trackId,
	elementId,
	update,
	elementPredicate,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
	update: (element: TimelineElement) => TimelineElement;
	elementPredicate?: (element: TimelineElement) => boolean;
}): SceneTracks {
	return updateTrackInSceneTracks({
		tracks,
		trackId,
		update: (track) =>
			updateElementInTrack({ track, elementId, update, elementPredicate }),
	});
}
