import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks, TimelineTrack } from "@/timeline";
import { splitElementAtTimes } from "@/timeline/split-element";
import type { MediaTime } from "@/wasm";

/**
 * 한 소스의 클립(영상과 분리된 원본 오디오)을 여러 시각에서 한 번에 나눈다. 지우거나 당기지 않는다.
 * 한 명령이라 ⌘Z 한 번에 모두 돌아간다
 */
export class SplitAtTimesCommand extends Command {
	label = "Split at edit points";
	private savedState: SceneTracks | null = null;
	private readonly mediaId: string;
	private readonly times: readonly MediaTime[];
	private readonly select: readonly { trackId: string; elementId: string }[];

	constructor({
		mediaId,
		times,
		select,
	}: {
		mediaId: string;
		times: readonly MediaTime[];
		/** 나눈 뒤에도 선택해 둘 요소. 첫 조각이 원래 id를 지킨다 */
		select: readonly { trackId: string; elementId: string }[];
	}) {
		super();
		this.mediaId = mediaId;
		this.times = times;
		this.select = select;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		const splitTrack = <TTrack extends TimelineTrack>(track: TTrack): TTrack => {
			const elements = track.elements.flatMap((element) =>
				"mediaId" in element && element.mediaId === this.mediaId
					? splitElementAtTimes({ element, times: this.times })
					: [element],
			);
			return { ...track, elements } as TTrack;
		};
		const tracks = this.savedState.map((track) => splitTrack(track));
		editor.timeline.updateTracks(tracks);
		return createElementSelectionResult([...this.select]);
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}
