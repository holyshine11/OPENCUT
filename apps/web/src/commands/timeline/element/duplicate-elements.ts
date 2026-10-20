import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import type { SceneTracks, TimelineElement } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { EditorCore } from "@/core";
import { findDuplicateOffset } from "@/timeline/placement/overlap";
import { cloneAnimations } from "@/animation";
import { mediaTime, type MediaTime } from "@/wasm";

interface DuplicateElementsParams {
	elements: { trackId: string; elementId: string }[];
}

export class DuplicateElementsCommand extends Command {
	private duplicatedElements: { trackId: string; elementId: string }[] = [];
	private savedState: SceneTracks | null = null;
	private elements: DuplicateElementsParams["elements"];

	constructor({ elements }: DuplicateElementsParams) {
		super();
		this.elements = elements;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		this.duplicatedElements = [];

		let updatedTracks = this.savedState;

		for (const track of this.savedState) {
			const elementsToDuplicate = this.elements.filter(
				(elementEntry) => elementEntry.trackId === track.id,
			);

			if (elementsToDuplicate.length === 0) {
				continue;
			}

			if (track.locked) {
				continue;
			}

			const elementIdsToDuplicate = new Set(
				elementsToDuplicate.map((element) => element.elementId),
			);
			const originals = track.elements.filter((element) =>
				elementIdsToDuplicate.has(element.id),
			);
			const offset = findDuplicateOffset({
				trackElements: track.elements,
				originals,
			});
			const newTrackElements = originals.map((element) =>
				buildDuplicateElement({
					element,
					id: generateUUID(),
					startTime: mediaTime({ ticks: element.startTime + offset }),
				}),
			);

			updatedTracks = updatedTracks.map((candidate) =>
				candidate.id === track.id
					? ({
							...candidate,
							elements: [...candidate.elements, ...newTrackElements],
						} as typeof candidate)
					: candidate,
			);

			for (const element of newTrackElements) {
				this.duplicatedElements.push({
					trackId: track.id,
					elementId: element.id,
				});
			}
		}

		editor.timeline.updateTracks(updatedTracks);

		if (this.duplicatedElements.length > 0) {
			return createElementSelectionResult(this.duplicatedElements);
		}
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}

	getDuplicatedElements(): { trackId: string; elementId: string }[] {
		return this.duplicatedElements;
	}
}

export function buildDuplicateElement({
	element,
	id,
	startTime,
}: {
	element: TimelineElement;
	id: string;
	startTime: MediaTime;
}): TimelineElement {
	return {
		...element,
		id,
		name: `${element.name} (copy)`,
		startTime,
		// 복제본은 원본 그룹에 넣지 않는다
		groupId: undefined,
		animations: cloneAnimations({
			animations: element.animations,
			shouldRegenerateKeyframeIds: true,
		}),
	};
}
