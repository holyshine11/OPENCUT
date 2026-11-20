import type { SceneTracks, TimelineElement } from "@/timeline";
import { type MediaTime, mediaTimeToSeconds } from "@/wasm";
import { type Box, type EditBeat, MIN_BEAT_SECONDS } from "./plan";

/** 롱폼 타임라인의 영상 클립 하나와 그 위에 얹힌 말·자막. 손으로 고친 것까지 타임라인에서 그대로 읽는다 */
export interface LongBeat {
	clip: string;
	start: number;
	end: number;
	narration: string;
	voice: "wife" | "husband";
	caption: string;
	/** 롱폼에서 가린 모자이크. 쇼츠가 같은 구간을 쓰면 그대로 옮긴다 */
	mosaic: Box[];
}

const seconds = (time: MediaTime) => mediaTimeToSeconds({ time });
// 음성·자막은 컷 시작에 딱 맞거나 조금 밀려 놓인다
const EPSILON = 0.05;

/**
 * 타임라인을 롱폼 컷 목록으로 읽는다. 음성(tts)과 자막은 시작 시각이 든 컷에 붙인다.
 * clipOf: 미디어 id → 계획의 클립 번호. 목록에 없는 미디어(효과음·배경음악·음성)는 컷이 아니다
 */
export function readLongCut({ tracks, clipOf }: { tracks: SceneTracks; clipOf: Record<string, string> }): LongBeat[] {
	const elements = tracks.flatMap((track): TimelineElement[] => track.elements);
	const videos = elements
		.flatMap((element) => (element.type === "video" && !element.hidden && clipOf[element.mediaId] ? [element] : []))
		.sort((a, b) => a.startTime - b.startTime);
	const ownerOf = (at: number) => {
		let owner = 0;
		for (const [index, video] of videos.entries()) if (seconds(video.startTime) <= at + EPSILON) owner = index;
		return owner;
	};
	const lines = elements.flatMap((element) => (element.type === "audio" && element.tts ? [element] : []));
	// 롱폼에서 가장 많이 읽은 목소리가 아내, 나머지는 남편이다
	const counts = new Map<string, number>();
	for (const line of lines) if (line.tts) counts.set(line.tts.voice, (counts.get(line.tts.voice) ?? 0) + 1);
	const wife = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];

	const beats = videos.map((video) => {
		const start = seconds(video.trimStart);
		return {
			clip: clipOf[video.mediaId],
			start,
			end: start + seconds(video.duration) * (video.retime?.rate ?? 1),
			narration: [] as string[],
			voice: "wife" as LongBeat["voice"],
			caption: [] as string[],
			// shortcut: 회전은 버리고 크기만 읽는다. AI가 건 모자이크는 회전이 없다. 손으로 돌린 모자이크를 옮겨야 하면 회전을 Box에 넣는다
			mosaic: (video.masks ?? []).flatMap((mask) => {
				if (mask.fill !== "mosaic" || mask.type !== "rectangle") return [];
				const { centerX, centerY, width, height, scale } = mask.params;
				const w = width * (scale || 1);
				const h = height * (scale || 1);
				return [{ x: centerX + 0.5 - w / 2, y: centerY + 0.5 - h / 2, w, h }];
			}),
		};
	});
	if (beats.length === 0) return [];
	for (const line of lines) {
		if (!line.tts?.text) continue;
		const beat = beats[ownerOf(seconds(line.startTime))];
		beat.narration.push(line.tts.text);
		if (line.tts.voice !== wife) beat.voice = "husband";
	}
	for (const element of elements) {
		if (element.type !== "text" || element.hidden || typeof element.params.content !== "string") continue;
		beats[ownerOf(seconds(element.startTime))].caption.push(element.params.content.trim());
	}
	return beats.map((beat) => ({
		...beat,
		narration: beat.narration.join(" "),
		caption: beat.caption.filter(Boolean).join(" / "),
	}));
}

/**
 * 쇼츠 컷을 롱폼에 쓴 구간 안으로 자르고, 그 구간에 건 모자이크를 옮긴다.
 * Claude는 스틸 없이 고르니 롱폼에 없던 구간은 무엇이(얼굴이) 찍혔는지 모른다. 그런 컷은 버린다
 */
export function fitToLong({ beats, long }: { beats: EditBeat[]; long: LongBeat[] }): EditBeat[] {
	return beats.flatMap((beat) => {
		const overlap = (item: LongBeat) => Math.min(item.end, beat.end) - Math.max(item.start, beat.start);
		const best = long
			.filter((item) => item.clip === beat.clip && overlap(item) > 0)
			.sort((a, b) => overlap(b) - overlap(a))[0];
		if (!best) return [];
		const start = Math.max(beat.start, best.start);
		const end = Math.min(beat.end, best.end);
		if (end - start < MIN_BEAT_SECONDS) return [];
		const mosaic = long
			.filter((item) => item.clip === beat.clip && item.start < end && start < item.end)
			.flatMap((item) => item.mosaic);
		return [{ ...beat, start, end, mosaic: [...beat.mosaic, ...mosaic] }];
	});
}
