import type { ElementRef, SceneTracks, TimelineElement } from "./types";

type GroupUpdate = ElementRef & { patch: Partial<TimelineElement> };

const MIN_GROUP_SIZE = 2;

const keyOf = ({ trackId, elementId }: ElementRef) => `${trackId}:${elementId}`;

function listGroupedRefs({ tracks }: { tracks: SceneTracks }) {
	return [...tracks.overlay, tracks.main, ...tracks.audio].flatMap((track) =>
		track.elements.flatMap((element) =>
			element.groupId
				? [
						{
							trackId: track.id,
							elementId: element.id,
							groupId: element.groupId,
						},
					]
				: [],
		),
	);
}

/** 고른 클립에 같은 그룹의 클립을 모두 더한다. 고른 순서는 그대로 둔다 */
export function expandToGroups({
	tracks,
	elements,
}: {
	tracks: SceneTracks;
	elements: ElementRef[];
}): ElementRef[] {
	const picked = new Set(elements.map(keyOf));
	const grouped = listGroupedRefs({ tracks });
	const groupIds = new Set(
		grouped.filter((ref) => picked.has(keyOf(ref))).map((ref) => ref.groupId),
	);
	const extra = grouped
		.filter((ref) => groupIds.has(ref.groupId) && !picked.has(keyOf(ref)))
		.map(({ trackId, elementId }) => ({ trackId, elementId }));
	return extra.length === 0 ? elements : [...elements, ...extra];
}

/** 두 개 이상일 때만 묶는다. 이미 그룹에 든 클립은 그 그룹째 새 그룹으로 옮긴다 */
export function buildGroupUpdates({
	tracks,
	elements,
	groupId,
}: {
	tracks: SceneTracks;
	elements: ElementRef[];
	groupId: string;
}): GroupUpdate[] {
	const members = expandToGroups({ tracks, elements });
	if (members.length < MIN_GROUP_SIZE) return [];
	return members.map((ref) => ({ ...ref, patch: { groupId } }));
}

/** 고른 클립이 속한 그룹을 통째로 푼다 */
export function buildUngroupUpdates({
	tracks,
	elements,
}: {
	tracks: SceneTracks;
	elements: ElementRef[];
}): GroupUpdate[] {
	const grouped = new Set(listGroupedRefs({ tracks }).map(keyOf));
	return expandToGroups({ tracks, elements })
		.filter((ref) => grouped.has(keyOf(ref)))
		.map((ref) => ({ ...ref, patch: { groupId: undefined } }));
}
