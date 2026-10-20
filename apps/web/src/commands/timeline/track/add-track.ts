import { Command, type CommandResult } from "@/commands/base-command";
import type { SceneTracks, TrackType } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { EditorCore } from "@/core";
import {
	buildEmptyTrack,
	getDefaultInsertIndexForTrack,
} from "@/timeline/placement";

export class AddTrackCommand extends Command {
	private trackId: string;
	private savedState: SceneTracks | null = null;

	constructor({
		type,
		index,
		keepWhenEmpty = false,
	}: {
		type: TrackType;
		index?: number;
		/** 사용자가 직접 만든 빈 트랙이면 true. 자동 정리에서 빠진다 */
		keepWhenEmpty?: boolean;
	}) {
		super();
		this.type = type;
		this.index = index;
		this.keepWhenEmpty = keepWhenEmpty;
		this.trackId = generateUUID();
	}

	private type: TrackType;
	private index?: number;
	private keepWhenEmpty: boolean;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		const insertIndex =
			this.index ??
			getDefaultInsertIndexForTrack({
				tracks: this.savedState,
				trackType: this.type,
			});

		const updatedTracks = [
			...this.savedState.slice(0, insertIndex),
			{
				...buildEmptyTrack({ id: this.trackId, type: this.type }),
				...(this.keepWhenEmpty ? { keepWhenEmpty: true } : {}),
			},
			...this.savedState.slice(insertIndex),
		];

		editor.timeline.updateTracks(updatedTracks);
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}

	getTrackId(): string {
		return this.trackId;
	}
}
