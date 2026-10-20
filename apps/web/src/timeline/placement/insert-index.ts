import type { SceneTracks, TrackType } from "@/timeline";

/** 새 트랙의 기본 자리. 오디오는 맨 아래, 효과는 맨 위, 나머지는 오디오 트랙들 바로 위 */
export function getDefaultInsertIndexForTrack({
	tracks,
	trackType,
}: {
	tracks: SceneTracks;
	trackType: TrackType;
}): number {
	if (trackType === "audio") {
		return tracks.length;
	}

	if (trackType === "effect") {
		return 0;
	}

	const firstAudioIndex = tracks.findIndex((track) => track.type === "audio");
	return firstAudioIndex < 0 ? tracks.length : firstAudioIndex;
}

/** 새 트랙을 가장 위에 둘 때의 자리. 오디오는 오디오 트랙들 맨 위(없으면 맨 아래) */
export function getHighestInsertIndexForTrack({
	tracks,
	trackType,
}: {
	tracks: SceneTracks;
	trackType: TrackType;
}): number {
	if (trackType !== "audio") {
		return 0;
	}

	const firstAudioIndex = tracks.findIndex((track) => track.type === "audio");
	return firstAudioIndex < 0 ? tracks.length : firstAudioIndex;
}

export function resolvePreferredNewTrackPlacement({
	tracks,
	preferredIndex,
	direction,
}: {
	tracks: SceneTracks;
	trackType: TrackType;
	preferredIndex: number;
	direction: "above" | "below";
}): { insertIndex: number; insertPosition: "above" | "below" | null } {
	if (tracks.length === 0) {
		return { insertIndex: 0, insertPosition: null };
	}

	const safePreferredIndex = Math.min(
		Math.max(preferredIndex, 0),
		tracks.length - 1,
	);
	return {
		insertIndex:
			direction === "above" ? safePreferredIndex : safePreferredIndex + 1,
		insertPosition: direction,
	};
}
