import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import { applyTimelineEdits, type TimelineEdit } from "@/autocut/apply";
import settings from "@/autocut/settings.json";
import type { SceneTracks } from "@/timeline";

/**
 * 한 클립에서 고른 구간들을 지우거나 배속으로 줄이고 뒤를 당긴다. 자막·분리된 원본 오디오·위 트랙도 같이 당겨 싱크를 지킨다.
 * 다른 소스의 오디오 트랙(배경음악)은 끊기지 않도록 건드리지 않는다
 */
export class AutocutCommand extends Command {
	label = "Auto cut";
	readonly ripplesItself = true;
	private savedState: SceneTracks | null = null;
	private readonly mediaId: string;
	private readonly ranges: readonly TimelineEdit[];
	private readonly select: readonly { trackId: string; elementId: string }[];

	constructor({
		mediaId,
		ranges,
		select,
	}: {
		mediaId: string;
		ranges: readonly TimelineEdit[];
		/** 적용 뒤에도 선택해 둘 요소. 잘려 없어진 것은 뺀다 */
		select: readonly { trackId: string; elementId: string }[];
	}) {
		super();
		this.mediaId = mediaId;
		this.ranges = ranges;
		this.select = select;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		const tracks = applyTimelineEdits({
			tracks: this.savedState,
			edits: this.ranges,
			crossfadeSeconds: settings.apply.crossfadeSeconds,
			maintainPitch: settings.apply.maintainPitch,
			fps: editor.project.getActive().settings.fps,
			// ponytail: 다른 소스 오디오 트랙은 전부 배경음악으로 본다. 효과음 트랙도 안 당겨지니 문제가 되면 트랙 단위 선택을 넣는다
			shouldEdit: (track) =>
				track.type !== "audio" ||
				track.elements.some(
					(element) => "mediaId" in element && element.mediaId === this.mediaId,
				),
		});
		editor.timeline.updateTracks(tracks);
		return createElementSelectionResult(
			this.select.filter((ref) =>
				tracks
					.find((track) => track.id === ref.trackId)
					?.elements.some((element) => element.id === ref.elementId),
			),
		);
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}
