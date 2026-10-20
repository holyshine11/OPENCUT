import type { SceneTracks } from "@/timeline";
import { findTrackInSceneTracks } from "@/timeline/track-element-update";
import type { GroupMoveResult, PlannedTrackCreation } from "./types";

/**
 * ⌥ 복사는 원본이 제자리에 남는다. 복사본이 같은 트랙에서 원본과 겹치면
 * (트랙 전체를 덮는 조정 레이어처럼 긴 클립은 거의 항상 겹친다) 그 트랙 바로 위에
 * 새 트랙을 만들어 복사본을 옮긴다. 겹치지 않으면 계획을 그대로 돌려주고,
 * 안전하게 놓을 자리가 없으면 null을 돌려준다.
 */
export function redirectOverlappingCopies({
	tracks,
	result,
	createTrackId,
}: {
	tracks: SceneTracks;
	result: GroupMoveResult;
	createTrackId: () => string;
}): GroupMoveResult | null {
	const overlapsSource = (move: GroupMoveResult["moves"][number]) => {
		if (move.targetTrackId !== move.sourceTrackId) return false;
		const element = findTrackInSceneTracks({
			tracks,
			trackId: move.sourceTrackId,
		})?.elements.find(({ id }) => id === move.elementId);
		return (
			!!element &&
			move.newStartTime < element.startTime + element.duration &&
			element.startTime < move.newStartTime + element.duration
		);
	};

	const overlappedTrackIds = [
		...new Set(
			result.moves.filter(overlapsSource).map((move) => move.targetTrackId),
		),
	];
	if (overlappedTrackIds.length === 0) return result;
	// 이미 새 트랙을 만들기로 한 이동과 섞으면 끼워 넣을 자리가 어긋나므로 복사하지 않는다
	if (result.createTracks.length > 0) return null;

	const sourceTracks = overlappedTrackIds
		.map((trackId) => ({
			trackId,
			index: tracks.findIndex((track) => track.id === trackId),
		}))
		.filter(({ index }) => index >= 0)
		.sort((first, second) => first.index - second.index);

	const newTrackIdBySource = new Map<string, string>();
	const createTracks: PlannedTrackCreation[] = sourceTracks.map(
		({ trackId, index }, order) => {
			const id = createTrackId();
			newTrackIdBySource.set(trackId, id);
			// 앞에서 끼운 트랙만큼 아래로 밀리므로 order를 더한다
			return { id, type: tracks[index].type, index: index + order };
		},
	);

	const retarget = (trackId: string) =>
		newTrackIdBySource.get(trackId) ?? trackId;
	return {
		moves: result.moves.map((move) =>
			newTrackIdBySource.has(move.targetTrackId)
				? { ...move, targetTrackId: retarget(move.targetTrackId) }
				: move,
		),
		createTracks,
		targetSelection: result.targetSelection.map((ref) => ({
			...ref,
			trackId: retarget(ref.trackId),
		})),
	};
}
