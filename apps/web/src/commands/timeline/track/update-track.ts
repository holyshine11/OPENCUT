import { Command, type CommandResult } from "@/commands/base-command";
import type { AudioTrack, SceneTracks, TimelineTrack } from "@/timeline";
import { EditorCore } from "@/core";
import { canTrackHaveAudio, updateTrackInSceneTracks } from "@/timeline";

/** 트랙 공통 속성(이름·색·잠금)과 믹스(볼륨·팬)를 바꾼다. 믹스는 소리 나는 트랙에만 적용된다 */
export type TrackPatch = Partial<
	Pick<TimelineTrack, "name" | "color" | "locked">
> &
	Partial<Pick<AudioTrack, "volume" | "pan" | "solo">>;

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
				update: (track) => {
					const { volume, pan, solo, ...common } = this.patch;
					if (!canTrackHaveAudio(track)) return { ...track, ...common };
					return {
						...track,
						...common,
						...(volume !== undefined && { volume }),
						...(pan !== undefined && { pan }),
						...(solo !== undefined && { solo }),
					};
				},
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
