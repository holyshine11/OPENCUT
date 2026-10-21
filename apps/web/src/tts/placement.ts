import { buildCaptionChunks } from "@/transcription/caption";
import type {
	CaptionChunk,
	CaptionLayout,
	TranscriptionSegment,
} from "@/transcription/types";

/**
 * 문장 음성을 start(초)부터 순서대로 놓는다. 문장 사이는 pause(초)만큼 비운다.
 * 돌려주는 구간 하나가 음성 클립 하나이고, 그 구간이 곧 자막 시간이다
 */
export function placeLines({
	lines,
	start,
	pause,
}: {
	lines: { text: string; duration: number }[];
	start: number;
	pause: number;
}): TranscriptionSegment[] {
	let cursor = start;
	return lines.map(({ text, duration }) => {
		const segment = { text, start: cursor, end: cursor + duration };
		cursor = segment.end + pause;
		return segment;
	});
}

/**
 * 문장 하나의 자막. 단어 시간이 없어 글자 수 비율로 나눈다.
 * 최소 표시 시간 때문에 음성 끝을 넘어가지 않게 자른다. 넘어가면 다음 문장 자막과 겹친다
 */
export function buildLineCaptions({
	segment,
	layout,
}: {
	segment: TranscriptionSegment;
	layout: CaptionLayout;
}): CaptionChunk[] {
	return buildCaptionChunks({ segments: [segment], layout })
		.map((caption) => ({
			...caption,
			duration: Math.min(caption.duration, segment.end - caption.startTime),
		}))
		.filter((caption) => caption.duration > 0);
}
