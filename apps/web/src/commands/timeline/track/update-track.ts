import { Command, type CommandResult } from "@/commands/base-command";
import type { SceneTracks, TimelineTrack } from "@/timeline";
import { EditorCore } from "@/core";
import { updateTrackInSceneTracks } from "@/timeline";

/** 트랙 공통 속성(색 등)을 바꾼다 */
export type TrackPatch = Partial<Pick<TimelineTrack, "color">>;

export class UpdateTrackCommand extends Command {
	private savedState: SceneTracks | null = null;
	private readonly trackId: string;
	private readonly patch: TrackPatch;

	constructor({ trackId, patch }: { trackId: string; patch: TrackPatch }) {
		super();
		this.trackId = trackId;
		this.patch = patch;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		editor.timeline.updateTracks(
			updateTrackInSceneTracks({
				tracks: this.savedState,
				trackId: this.trackId,
				update: (track) => ({ ...track, ...this.patch }),
			}),
		);
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}
