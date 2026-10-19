import { wcagLuminance } from "culori";
import type { TimelineElement, TimelineTrack, TrackType } from "@/timeline";

export const TIMELINE_AUDIO_WAVEFORM_COLOR = "rgba(255, 255, 255, 0.7)";

export const TIMELINE_TRACK_THEME: Record<
	TrackType,
	{
		/** 트랙·클립 기본색. 영상 트랙은 썸네일이 보이도록 비워 둔다 */
		color?: string;
		waveformColor?: string;
	}
> = {
	video: {},
	text: { color: "#5DBAA0" },
	audio: {
		color: "#8F5DBA",
		waveformColor: TIMELINE_AUDIO_WAVEFORM_COLOR,
	},
	graphic: { color: "#BA5D7A" },
	effect: { color: "#5D93BA" },
} as const;

/** 트랙·클립 색 프리셋 */
export const TIMELINE_COLOR_PALETTE = [
	"#E05A5A",
	"#E0815A",
	"#E0A85A",
	"#D9C85A",
	"#A8C85A",
	"#6CBF6C",
	"#5DBAA0",
	"#5AB8D0",
	"#5D93BA",
	"#5A6FD0",
	"#8F5DBA",
	"#B85AD0",
	"#BA5D7A",
	"#D05A9E",
	"#9A8A7A",
	"#7A7F88",
] as const;

export const SELECTED_TRACK_ROW_CLASS = "bg-accent/50";
/** 잠긴 트랙 위에 덮는 빗금 */
export const LOCKED_TRACK_OVERLAY_CLASS =
	"bg-[repeating-linear-gradient(-45deg,transparent_0_6px,rgb(0_0_0/0.3)_6px_12px)]";
export const DEFAULT_TIMELINE_BOOKMARK_COLOR = "#009dff";

export function getTrackColor({
	track,
}: {
	track: Pick<TimelineTrack, "type" | "color">;
}): string | undefined {
	return track.color ?? TIMELINE_TRACK_THEME[track.type].color;
}

/** 클립 색 → 트랙 색 → 트랙 종류 기본색 순으로 고른다 */
export function resolveTimelineElementColor({
	element,
	track,
}: {
	element: Pick<TimelineElement, "color">;
	track: Pick<TimelineTrack, "type" | "color">;
}): string | undefined {
	return element.color ?? getTrackColor({ track });
}

/** 이 밝기를 넘는 배경이면 클립 글자를 검게 바꾼다. 기본 프리셋은 흰 글자를 유지한다 */
const DARK_TEXT_MIN_LUMINANCE = 0.45;

export function prefersDarkText({ color }: { color: string }): boolean {
	return wcagLuminance(color) > DARK_TEXT_MIN_LUMINANCE;
}
