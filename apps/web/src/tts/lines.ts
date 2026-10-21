// 대본 읽기 문장 하나(음성 클립 + 같은 lineId 자막)를 찾고, 자막을 고쳤는지 보고, 길이가 바뀌면 뒤 클립을 미는 계산
import type {
	AudioElement,
	SceneTracks,
	TextElement,
	TimelineElement,
} from "@/timeline/types";
import { type MediaTime, mediaTime } from "@/wasm";

export interface LineCaption {
	trackId: string;
	element: TextElement;
}

/** 같은 문장(lineId)의 음성 클립. 지웠으면 null */
export function findLineAudio({
	tracks,
	lineId,
}: {
	tracks: SceneTracks;
	lineId: string;
}): { trackId: string; element: AudioElement } | null {
	for (const track of tracks) {
		if (track.type !== "audio") continue;
		const element = track.elements.find((item) => item.tts?.lineId === lineId);
		if (element) return { trackId: track.id, element };
	}
	return null;
}

/** 같은 문장의 자막. 자막 목록처럼 시작 시간순이다 */
export function findLineCaptions({
	tracks,
	lineId,
}: {
	tracks: SceneTracks;
	lineId: string;
}): LineCaption[] {
	return tracks
		.flatMap((track) =>
			track.type === "text"
				? track.elements
						.filter((element) => element.ttsLineId === lineId)
						.map((element) => ({ trackId: track.id, element }))
				: [],
		)
		.sort((a, b) => a.element.startTime - b.element.startTime);
}

/** 자막 글자를 이어 붙인 문장. 자막 안 줄바꿈과 자막 사이는 띄어쓰기 하나로 본다 */
export function joinCaptionText({ captions }: { captions: LineCaption[] }): string {
	return captions
		.map(({ element }) => String(element.params.content ?? ""))
		.join(" ")
		.split(/\s+/)
		.filter(Boolean)
		.join(" ");
}

// 자막을 만들 때 숏폼 레이아웃은 단어 끝 마침표·쉼표를 뺀다(transcription/caption.ts groupWords). 비교할 때 양쪽에서 같이 뺀다
function captionWords({ text }: { text: string }): string[] {
	return text
		.split(/\s+/)
		.map((word) => word.replace(/[.,]+$/, ""))
		.filter(Boolean);
}

/**
 * 자막 글자가 음성 문장(tts.text)과 달라졌으면 true. 자막이 없으면 비교할 것이 없어 false다.
 * 띄어쓰기·줄바꿈과 단어 끝 마침표·쉼표만 다른 것은 같다고 본다
 */
export function isLineStale({
	text,
	captions,
}: {
	text: string;
	captions: LineCaption[];
}): boolean {
	if (captions.length === 0) return false;
	return (
		captionWords({ text }).join(" ") !==
		captionWords({ text: joinCaptionText({ captions }) }).join(" ")
	);
}

/**
 * 문장 음성 길이가 delta(틱)만큼 바뀌었을 때 trackIds 트랙에서 afterTime(옛 음성 끝) 이후에 시작하는
 * 클립을 delta만큼 옮기는 패치. UpdateElementsCommand에 그대로 넘긴다
 */
export function rippleLineUpdates({
	tracks,
	trackIds,
	afterTime,
	delta,
}: {
	tracks: SceneTracks;
	trackIds: string[];
	afterTime: MediaTime;
	delta: number;
}): { trackId: string; elementId: string; patch: Partial<TimelineElement> }[] {
	if (delta === 0) return [];
	return tracks
		.filter((track) => trackIds.includes(track.id))
		.flatMap((track) => {
			const elements: TimelineElement[] = track.elements;
			return elements
				.filter((element) => element.startTime >= afterTime)
				.map((element) => ({
					trackId: track.id,
					elementId: element.id,
					patch: { startTime: mediaTime({ ticks: element.startTime + delta }) },
				}));
		});
}
