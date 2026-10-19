import { findTrackInSceneTracks } from "./track-element-update";
import type {
	SceneTracks,
	TimelineTrack,
	VideoTrack,
	AudioTrack,
	GraphicTrack,
	TextTrack,
	EffectTrack,
} from "@/timeline";

export function canTrackHaveAudio(
	track: TimelineTrack,
): track is VideoTrack | AudioTrack {
	return track.type === "audio" || track.type === "video";
}

export function canTrackBeHidden(
	track: TimelineTrack,
): track is VideoTrack | TextTrack | GraphicTrack | EffectTrack {
	return track.type !== "audio";
}

export function isTrackLocked(
	track: Pick<TimelineTrack, "locked"> | null | undefined,
): boolean {
	return track?.locked === true;
}

/** 잠긴 트랙의 클립을 뺀다. 선택·자르기·삭제가 모두 이 거름망을 지난다 */
export function excludeLockedElements<TRef extends { trackId: string }>({
	tracks,
	elements,
}: {
	tracks: SceneTracks;
	elements: readonly TRef[];
}): TRef[] {
	return elements.filter(
		({ trackId }) =>
			!isTrackLocked(findTrackInSceneTracks({ tracks, trackId })),
	);
}
