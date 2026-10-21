import type { SceneTracks } from "@/timeline";
import { getTrackTypeForElementType } from "@/timeline/placement/compatibility";
import { canPlaceTimeSpansOnTrack } from "@/timeline/placement/overlap";
import type {
	GroupMoveResult,
	MoveGroup,
	PlannedElementMove,
	PlannedTrackCreation,
} from "./types";
import {
	getDisplayTracks,
	getTrackPlacementByDisplayIndex,
	getTrackPlacementById,
} from "./track-placement";
import {
	addMediaTime,
	maxMediaTime,
	type MediaTime,
	subMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

type GroupMoveTarget =
	| {
			kind: "existingTrack";
			anchorTargetTrackId: string;
	  }
	| {
			kind: "newTracks";
			anchorInsertIndex: number;
			newTrackIds: string[];
	  };

export function resolveGroupMove({
	group,
	tracks,
	anchorStartTime,
	target,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	target: GroupMoveTarget;
}): GroupMoveResult | null {
	if (target.kind === "newTracks") {
		return resolveNewTrackMove({
			group,
			tracks,
			anchorStartTime,
			anchorInsertIndex: target.anchorInsertIndex,
			newTrackIds: target.newTrackIds,
		});
	}

	return resolveExistingTrackMove({
		group,
		tracks,
		anchorStartTime,
		anchorTargetTrackId: target.anchorTargetTrackId,
	});
}

function resolveExistingTrackMove({
	group,
	tracks,
	anchorStartTime,
	anchorTargetTrackId,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	anchorTargetTrackId: string;
}): GroupMoveResult | null {
	const anchorTargetPlacement = getTrackPlacementById({
		tracks,
		trackId: anchorTargetTrackId,
	});
	if (!anchorTargetPlacement) {
		return null;
	}

	const targetTrackIdsByElementId = resolveExistingTrackIdsByElementId({
		group,
		tracks,
		anchorTargetDisplayIndex: anchorTargetPlacement.displayIndex,
	});
	if (!targetTrackIdsByElementId) {
		return null;
	}

	const clampedAnchorStartTime = clampAnchorStartTime({
		group,
		anchorStartTime,
	});

	const moves = group.members.map((member) => ({
		sourceTrackId: member.trackId,
		targetTrackId:
			targetTrackIdsByElementId.get(member.elementId) ?? member.trackId,
		elementId: member.elementId,
		newStartTime: addMediaTime({
			a: clampedAnchorStartTime,
			b: member.timeOffset,
		}),
	}));

	if (!canApplyMovesToExistingTracks({ tracks, moves })) {
		return null;
	}

	return {
		moves,
		createTracks: [],
		targetSelection: moves.map(({ elementId, targetTrackId }) => ({
			trackId: targetTrackId,
			elementId,
		})),
	};
}

function resolveNewTrackMove({
	group,
	tracks,
	anchorStartTime,
	anchorInsertIndex,
	newTrackIds,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorStartTime: MediaTime;
	anchorInsertIndex: number;
	newTrackIds: string[];
}): GroupMoveResult | null {
	const sortedMembers = [...group.members].sort(
		(leftMember, rightMember) =>
			leftMember.displayIndex - rightMember.displayIndex,
	);
	// 같은 트랙에서 온 클립은 새 트랙 하나에 함께 놓는다. 원래 트랙 순서대로 새 트랙을 만든다
	const sourceTrackIds = [
		...new Set(sortedMembers.map((member) => member.trackId)),
	];
	const rankOf = (member: (typeof sortedMembers)[number]) =>
		sourceTrackIds.indexOf(member.trackId);
	const anchorMember = sortedMembers.find(
		(member) => member.elementId === group.anchor.elementId,
	);
	if (!anchorMember || newTrackIds.length < sourceTrackIds.length) {
		return null;
	}
	const anchorMemberIndex = rankOf(anchorMember);

	const clampedAnchorStartTime = clampAnchorStartTime({
		group,
		anchorStartTime,
	});
	const blockStartIndex = Math.max(
		0,
		Math.min(anchorInsertIndex - anchorMemberIndex, tracks.length),
	);

	const createTracks: PlannedTrackCreation[] = sourceTrackIds.map(
		(trackId, rank) => ({
			id: newTrackIds[rank],
			type: getTrackTypeForElementType({
				elementType: sortedMembers.find((member) => member.trackId === trackId)!
					.elementType,
			}),
			index: blockStartIndex + rank,
		}),
	);
	const moves = sortedMembers.map((member) => ({
		sourceTrackId: member.trackId,
		targetTrackId: newTrackIds[rankOf(member)],
		elementId: member.elementId,
		newStartTime: addMediaTime({
			a: clampedAnchorStartTime,
			b: member.timeOffset,
		}),
	}));

	return {
		moves,
		createTracks,
		targetSelection: moves.map(({ elementId, targetTrackId }) => ({
			trackId: targetTrackId,
			elementId,
		})),
	};
}

function resolveExistingTrackIdsByElementId({
	group,
	tracks,
	anchorTargetDisplayIndex,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorTargetDisplayIndex: number;
}): Map<string, string> | null {
	const sortedMembers = [...group.members].sort(
		(leftMember, rightMember) =>
			leftMember.displayIndex - rightMember.displayIndex,
	);
	const anchorMemberIndex = sortedMembers.findIndex(
		(member) => member.elementId === group.anchor.elementId,
	);
	if (anchorMemberIndex < 0) {
		return null;
	}

	const keptOffsets = resolveByTrackOffset({
		group,
		tracks,
		anchorTargetDisplayIndex,
	});
	if (keptOffsets) {
		return keptOffsets;
	}

	const targetTrackIdsByElementId = new Map<string, string>();
	const usedTrackIds = new Set<string>();
	const anchorPlacement = getTrackPlacementByDisplayIndex({
		tracks,
		displayIndex: anchorTargetDisplayIndex,
	});
	if (!anchorPlacement) {
		return null;
	}

	targetTrackIdsByElementId.set(
		group.anchor.elementId,
		anchorPlacement.trackId,
	);
	usedTrackIds.add(anchorPlacement.trackId);

	let upperBoundaryIndex = anchorTargetDisplayIndex;
	for (
		let memberIndex = anchorMemberIndex - 1;
		memberIndex >= 0;
		memberIndex -= 1
	) {
		const member = sortedMembers[memberIndex];
		const targetPlacement = findCompatibleTrackPlacement({
			tracks,
			requiredTrackType: getTrackTypeForElementType({
				elementType: member.elementType,
			}),
			startDisplayIndex: upperBoundaryIndex - 1,
			step: -1,
			usedTrackIds,
		});
		if (!targetPlacement) {
			return null;
		}

		targetTrackIdsByElementId.set(member.elementId, targetPlacement.trackId);
		usedTrackIds.add(targetPlacement.trackId);
		upperBoundaryIndex = targetPlacement.displayIndex;
	}

	let lowerBoundaryIndex = anchorTargetDisplayIndex;
	for (
		let memberIndex = anchorMemberIndex + 1;
		memberIndex < sortedMembers.length;
		memberIndex += 1
	) {
		const member = sortedMembers[memberIndex];
		const targetPlacement = findCompatibleTrackPlacement({
			tracks,
			requiredTrackType: getTrackTypeForElementType({
				elementType: member.elementType,
			}),
			startDisplayIndex: lowerBoundaryIndex + 1,
			step: 1,
			usedTrackIds,
		});
		if (!targetPlacement) {
			return null;
		}

		targetTrackIdsByElementId.set(member.elementId, targetPlacement.trackId);
		usedTrackIds.add(targetPlacement.trackId);
		lowerBoundaryIndex = targetPlacement.displayIndex;
	}

	return targetTrackIdsByElementId;
}

/**
 * 모든 클립을 기준 클립과 같은 칸 수만큼 위아래로 옮긴다. 좌우로만 끌면 각자 제 트랙에 남는다.
 * 옮겨 갈 트랙이 없거나 종류가 다르면 null이고, 그때는 가장 가까운 맞는 트랙을 찾는다
 */
function resolveByTrackOffset({
	group,
	tracks,
	anchorTargetDisplayIndex,
}: {
	group: MoveGroup;
	tracks: SceneTracks;
	anchorTargetDisplayIndex: number;
}): Map<string, string> | null {
	const offset = anchorTargetDisplayIndex - group.anchor.displayIndex;
	const targetTrackIdsByElementId = new Map<string, string>();
	for (const member of group.members) {
		const placement = getTrackPlacementByDisplayIndex({
			tracks,
			displayIndex: member.displayIndex + offset,
		});
		if (
			placement?.trackType !==
			getTrackTypeForElementType({ elementType: member.elementType })
		) {
			return null;
		}
		targetTrackIdsByElementId.set(member.elementId, placement.trackId);
	}
	return targetTrackIdsByElementId;
}

function findCompatibleTrackPlacement({
	tracks,
	requiredTrackType,
	startDisplayIndex,
	step,
	usedTrackIds,
}: {
	tracks: SceneTracks;
	requiredTrackType: ReturnType<typeof getTrackTypeForElementType>;
	startDisplayIndex: number;
	step: -1 | 1;
	usedTrackIds: Set<string>;
}) {
	for (
		let displayIndex = startDisplayIndex;
		displayIndex >= 0 && displayIndex < tracks.length;
		displayIndex += step
	) {
		const placement = getTrackPlacementByDisplayIndex({
			tracks,
			displayIndex,
		});
		if (!placement) {
			continue;
		}

		if (
			placement.trackType === requiredTrackType &&
			!usedTrackIds.has(placement.trackId)
		) {
			return placement;
		}
	}

	return null;
}

function clampAnchorStartTime({
	group,
	anchorStartTime,
}: {
	group: MoveGroup;
	anchorStartTime: MediaTime;
}): MediaTime {
	// 가장 앞선 클립이 0초보다 앞으로 가지 않게 한다
	const minimumAnchorStartTime = group.members.reduce(
		(minimumStartTime, member) =>
			member.timeOffset < ZERO_MEDIA_TIME
				? maxMediaTime({
						a: minimumStartTime,
						b: subMediaTime({
							a: ZERO_MEDIA_TIME,
							b: member.timeOffset,
						}),
					})
				: minimumStartTime,
		ZERO_MEDIA_TIME,
	);
	return anchorStartTime < minimumAnchorStartTime
		? minimumAnchorStartTime
		: anchorStartTime;
}

function canApplyMovesToExistingTracks({
	tracks,
	moves,
}: {
	tracks: SceneTracks;
	moves: PlannedElementMove[];
}): boolean {
	const movingElementIds = new Set(moves.map((move) => move.elementId));
	const sourceElements = new Map(
		getDisplayTracks({ tracks }).flatMap((track) =>
			track.elements.map((element) => [element.id, element] as const),
		),
	);
	const movesByTargetTrackId = new Map<string, PlannedElementMove[]>();
	for (const move of moves) {
		const targetMoves = movesByTargetTrackId.get(move.targetTrackId) ?? [];
		targetMoves.push(move);
		movesByTargetTrackId.set(move.targetTrackId, targetMoves);
	}

	for (const [targetTrackId, targetMoves] of movesByTargetTrackId) {
		const targetPlacement = getTrackPlacementById({
			tracks,
			trackId: targetTrackId,
		});
		if (!targetPlacement) {
			return false;
		}

		const targetTrack = getDisplayTracks({ tracks })[
			targetPlacement.displayIndex
		];
		if (!targetTrack) {
			return false;
		}

		const timeSpans = targetMoves.map((move) => {
			const sourceElement = sourceElements.get(move.elementId);
			return {
				startTime: move.newStartTime,
				duration: sourceElement?.duration ?? ZERO_MEDIA_TIME,
			};
		});
		if (hasOverlappingTimeSpans({ timeSpans })) {
			return false;
		}

		if (
			!canPlaceTimeSpansOnTrack({
				track: {
					locked: targetTrack.locked,
					elements: targetTrack.elements.filter(
						(element) => !movingElementIds.has(element.id),
					),
				},
				timeSpans,
			})
		) {
			return false;
		}
	}

	return true;
}

function hasOverlappingTimeSpans({
	timeSpans,
}: {
	timeSpans: Array<{ startTime: number; duration: number }>;
}): boolean {
	const sortedSpans = [...timeSpans].sort(
		(leftSpan, rightSpan) => leftSpan.startTime - rightSpan.startTime,
	);

	for (let spanIndex = 1; spanIndex < sortedSpans.length; spanIndex += 1) {
		const previousSpan = sortedSpans[spanIndex - 1];
		const currentSpan = sortedSpans[spanIndex];
		if (
			previousSpan.startTime + previousSpan.duration >
			currentSpan.startTime
		) {
			return true;
		}
	}

	return false;
}
