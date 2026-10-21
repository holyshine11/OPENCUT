import type {
	AudioTrack,
	ElementRef,
	SceneTracks,
	TextTrack,
	TimelineTrack,
} from "@/timeline/types";
import type { PlacementTimeSpan } from "@/timeline/placement";
import { canPlaceTimeSpansOnTrack } from "@/timeline/placement/overlap";

/** 대본 읽기가 넣을 트랙. null이면 새 트랙을 만든다 */
export interface TtsTargets {
	audioTrackId: string | null;
	captionTrackId: string | null;
}

// 잠긴 트랙에는 넣지 않는다
const isAudioTrack = (track: TimelineTrack | undefined): track is AudioTrack =>
	track?.type === "audio" && !track.locked;
const isTextTrack = (track: TimelineTrack | undefined): track is TextTrack =>
	track?.type === "text" && !track.locked;

/**
 * 넣을 트랙을 고른다. 음성은 고른 오디오 트랙 → 고른 오디오 클립의 트랙 → 대본 읽기 음성이 있는 가장 아래
 * 오디오 트랙(새 오디오 트랙은 맨 아래에 생기니 가장 최근에 만든 트랙이다) 순서다.
 * 자막은 그 음성 트랙의 문장과 이어진 자막 트랙 → 고른 텍스트 트랙 → 고른 텍스트 클립의 트랙 순서다
 */
export function pickTtsTargets({
	tracks,
	selectedTrackIds,
	selectedElements,
}: {
	tracks: SceneTracks;
	selectedTrackIds: string[];
	selectedElements: ElementRef[];
}): TtsTargets {
	const candidates = [
		...selectedTrackIds,
		...selectedElements.map((ref) => ref.trackId),
	].map((id) => tracks.find((track) => track.id === id));

	const audioTrack =
		candidates.find(isAudioTrack) ??
		tracks.findLast(
			(track): track is AudioTrack =>
				isAudioTrack(track) && track.elements.some((element) => element.tts),
		);
	const lineIds = new Set(
		audioTrack?.elements.flatMap((element) =>
			element.tts ? [element.tts.lineId] : [],
		),
	);
	const linkedTrack = tracks.find(
		(track): track is TextTrack =>
			isTextTrack(track) &&
			track.elements.some(
				(element) => element.ttsLineId && lineIds.has(element.ttsLineId),
			),
	);

	return {
		audioTrackId: audioTrack?.id ?? null,
		captionTrackId: (linkedTrack ?? candidates.find(isTextTrack))?.id ?? null,
	};
}

/**
 * 고른 트랙에서 넣을 구간이 기존 클립과 겹치면 그 종류는 새 트랙으로 보낸다.
 * 사용자 클립을 덮거나 밀지 않는다. 그사이 지워진 트랙도 새 트랙으로 간다(알리지 않는다)
 */
export function fitTtsTargets({
	tracks,
	targets,
	audioSpans,
	captionSpans,
}: {
	tracks: SceneTracks;
	targets: TtsTargets;
	audioSpans: PlacementTimeSpan[];
	captionSpans: PlacementTimeSpan[];
}): TtsTargets & { audioMoved: boolean; captionsMoved: boolean } {
	const fit = ({
		trackId,
		timeSpans,
	}: {
		trackId: string | null;
		timeSpans: PlacementTimeSpan[];
	}) => {
		const track = tracks.find((item) => item.id === trackId);
		if (!track) return { trackId: null, moved: false };
		return canPlaceTimeSpansOnTrack({ track, timeSpans })
			? { trackId: track.id, moved: false }
			: { trackId: null, moved: true };
	};
	const audio = fit({ trackId: targets.audioTrackId, timeSpans: audioSpans });
	const captions =
		captionSpans.length > 0
			? fit({ trackId: targets.captionTrackId, timeSpans: captionSpans })
			: { trackId: null, moved: false };

	return {
		audioTrackId: audio.trackId,
		captionTrackId: captions.trackId,
		audioMoved: audio.moved,
		captionsMoved: captions.moved,
	};
}
