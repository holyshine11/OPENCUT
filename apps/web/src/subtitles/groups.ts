import type { SceneTracks, TextElement } from "@/timeline";

export interface SubtitleEntry {
	trackId: string;
	element: TextElement;
}

export interface SubtitleGroup {
	groupId: string;
	entries: SubtitleEntry[];
}

/** 자막 그룹 표시가 붙은 텍스트를 그룹별로 모은다. 그룹과 그 안의 자막 모두 시작 시간순이다 */
export function listSubtitleGroups({
	tracks,
}: {
	tracks: SceneTracks;
}): SubtitleGroup[] {
	const groups = new Map<string, SubtitleEntry[]>();
	for (const track of tracks.overlay) {
		if (track.type !== "text") continue;
		for (const element of track.elements) {
			if (!element.subtitleGroupId) continue;
			const entries = groups.get(element.subtitleGroupId) ?? [];
			entries.push({ trackId: track.id, element });
			groups.set(element.subtitleGroupId, entries);
		}
	}

	return [...groups]
		.map(([groupId, entries]) => ({
			groupId,
			entries: entries.sort(
				(a, b) => a.element.startTime - b.element.startTime,
			),
		}))
		.sort(
			(a, b) => a.entries[0].element.startTime - b.entries[0].element.startTime,
		);
}
