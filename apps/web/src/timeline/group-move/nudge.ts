import type { ElementRef, SceneTracks } from "@/timeline";
import { mediaTime } from "@/wasm";
import { buildMoveGroup } from "./build-group";
import { resolveGroupMove } from "./resolve-move";
import type { PlannedElementMove } from "./types";

/**
 * 고른 클립을 제 트랙에서 delta(틱)만큼 함께 옮긴다. 끄는 것과 같은 규칙이라 0초 앞으로는 가지 않고,
 * 다른 클립과 겹치면 옮기지 않는다(null). 더 갈 곳이 없어 그대로면 null
 */
export function planNudge({
	tracks,
	selectedElements,
	delta,
}: {
	tracks: SceneTracks;
	selectedElements: ElementRef[];
	delta: number;
}): PlannedElementMove[] | null {
	const [anchorRef] = selectedElements;
	if (!anchorRef) return null;
	const group = buildMoveGroup({ anchorRef, selectedElements, tracks });
	const anchor = tracks
		.find((track) => track.id === anchorRef.trackId)
		?.elements.find((element) => element.id === anchorRef.elementId);
	if (!group || !anchor) return null;

	const result = resolveGroupMove({
		group,
		tracks,
		anchorStartTime: mediaTime({ ticks: Math.max(0, anchor.startTime + delta) }),
		target: { kind: "existingTrack", anchorTargetTrackId: anchorRef.trackId },
	});
	const anchorMove = result?.moves.find((move) => move.elementId === anchor.id);
	return result && anchorMove && anchorMove.newStartTime !== anchor.startTime
		? result.moves
		: null;
}
