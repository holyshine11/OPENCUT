import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import {
	buildEmptyTrack,
	validateElementTrackCompatibility,
} from "@/timeline/placement";
import type {
	PlannedElementMove,
	PlannedTrackCreation,
} from "@/timeline/group-move";
import { findTrackInSceneTracks } from "@/timeline/track-element-update";
import { generateUUID } from "@/utils/id";
import { buildDuplicateElement } from "./duplicate-elements";

export class MoveElementCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor({
		moves,
		createTracks = [],
		copy = false,
	}: {
		moves: PlannedElementMove[];
		createTracks?: PlannedTrackCreation[];
		/** 원본은 두고 옮길 자리에 복제본을 놓는다 */
		copy?: boolean;
	}) {
		super();
		this.moves = moves;
		this.createTracks = createTracks;
		// 다시 실행해도 같은 복제본 id를 쓰도록 미리 정한다
		this.copyIds = new Map(
			copy ? moves.map(({ elementId }) => [elementId, generateUUID()]) : [],
		);
	}

	private readonly moves: PlannedElementMove[];
	private readonly createTracks: PlannedTrackCreation[];
	private readonly copyIds: Map<string, string>;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		let tracksToUpdate = this.savedState;
		for (const createTrack of [...this.createTracks].sort(
			(firstTrack, secondTrack) => firstTrack.index - secondTrack.index,
		)) {
			tracksToUpdate = insertTrackAtDisplayIndex({
				tracks: tracksToUpdate,
				track: buildEmptyTrack({
					id: createTrack.id,
					type: createTrack.type,
				}),
				insertIndex: createTrack.index,
			});
		}

		const movedElementsById = new Map<string, TimelineElement>();
		for (const move of this.moves) {
			const sourceTrack = findTrackInSceneTracks({
				tracks: this.savedState,
				trackId: move.sourceTrackId,
			});
			const sourceElement = sourceTrack?.elements.find(
				(trackElement) => trackElement.id === move.elementId,
			);
			if (!sourceTrack || !sourceElement) {
				throw new Error("Source track or element not found");
			}

			const targetTrack = findTrackInSceneTracks({
				tracks: tracksToUpdate,
				trackId: move.targetTrackId,
			});
			if (!targetTrack) {
				throw new Error("Target track not found");
			}

			const validation = validateElementTrackCompatibility({
				element: sourceElement,
				track: targetTrack,
			});
			if (!validation.isValid) {
				throw new Error(validation.errorMessage);
			}

			const copyId = this.copyIds.get(move.elementId);
			movedElementsById.set(
				move.elementId,
				copyId
					? buildDuplicateElement({
							element: sourceElement,
							id: copyId,
							startTime: move.newStartTime,
						})
					: { ...sourceElement, startTime: move.newStartTime },
			);
		}

		const movedElementIds = new Set(
			this.copyIds.size > 0 ? [] : this.moves.map((move) => move.elementId),
		);
		const movedElementsByTargetTrackId = new Map<string, TimelineElement[]>();
		for (const move of this.moves) {
			const movedElement = movedElementsById.get(move.elementId);
			if (!movedElement) {
				continue;
			}

			const nextTargetElements =
				movedElementsByTargetTrackId.get(move.targetTrackId) ?? [];
			nextTargetElements.push(movedElement);
			movedElementsByTargetTrackId.set(move.targetTrackId, nextTargetElements);
		}

		const placeMovedElements = <TTrack extends TimelineTrack>(
			track: TTrack,
		): TTrack => ({
			...track,
			elements: [
				...track.elements.filter((element) => !movedElementIds.has(element.id)),
				...(movedElementsByTargetTrackId.get(track.id) ?? []),
			],
		});
		const updatedTracks = tracksToUpdate.map(placeMovedElements);

		editor.timeline.updateTracks(updatedTracks);
		return createElementSelectionResult(
			this.moves.map(({ elementId, targetTrackId }) => ({
				trackId: targetTrackId,
				elementId: this.copyIds.get(elementId) ?? elementId,
			})),
		);
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}
}

function insertTrackAtDisplayIndex({
	tracks,
	track,
	insertIndex,
}: {
	tracks: SceneTracks;
	track: TimelineTrack;
	insertIndex: number;
}): SceneTracks {
	const index = Math.max(0, Math.min(insertIndex, tracks.length));
	return [...tracks.slice(0, index), track, ...tracks.slice(index)];
}
