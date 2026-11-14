import { ADJUST_PRESETS } from "@/effects/definitions/adjust-presets";
import { isTransitionType, type TransitionType } from "@/transitions";

export interface EditBeat {
	clip: string;
	start: number;
	end: number;
	narration: string;
	caption: string;
	transition: TransitionType | null;
}

export interface EditPlan {
	concept: string;
	hook: string;
	/** ADJUST_PRESETS의 id. 모르는 값이면 null */
	look: string | null;
	beats: EditBeat[];
	youtube: { title: string; description: string; tags: string[] };
	review: string[];
}

const MIN_BEAT_SECONDS = 0.5;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const texts = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
/** 객체가 아니면 빈 객체. 밖에서 온 JSON을 읽을 때 쓴다 */
export const record = (value: unknown): Record<string, unknown> =>
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 객체인지 확인한 뒤다
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/**
 * Claude가 낸 마지막 메시지에서 계획을 꺼낸다. 모델 출력은 믿지 않는다:
 * 모르는 클립·길이를 벗어난 구간은 버리거나 클립 안으로 자른다. 쓸 컷이 하나도 없으면 던진다
 */
export function parsePlan({
	output,
	durations,
}: {
	output: string;
	/** 클립 번호 → 길이(초) */
	durations: Record<string, number>;
}): EditPlan {
	const start = output.indexOf("{");
	const end = output.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("no plan");
	const raw = record(JSON.parse(output.slice(start, end + 1)));

	const beats = (Array.isArray(raw.beats) ? raw.beats : []).flatMap((item): EditBeat[] => {
		const beat = record(item);
		const clip = text(beat.clip);
		const duration = durations[clip];
		if (duration === undefined) return [];
		const from = Math.max(0, Number(beat.start));
		const to = Math.min(duration, Number(beat.end));
		if (!(to - from >= MIN_BEAT_SECONDS)) return [];
		const transition = text(beat.transition);
		return [
			{
				clip,
				start: from,
				end: to,
				narration: text(beat.narration),
				caption: text(beat.caption),
				transition: isTransitionType(transition) ? transition : null,
			},
		];
	});
	if (beats.length === 0) throw new Error("no usable beats");

	const youtube = record(raw.youtube);
	const look = text(raw.look);
	return {
		concept: text(raw.concept),
		hook: text(raw.hook),
		look: ADJUST_PRESETS.some((preset) => preset.id === look) ? look : null,
		beats,
		youtube: {
			title: text(youtube.title),
			description: text(youtube.description),
			tags: texts(youtube.tags),
		},
		review: texts(raw.review),
	};
}

export interface PlacedBeat {
	/** 타임라인에서 컷이 시작하는 시각(초) */
	at: number;
	/** 컷 길이(초) */
	length: number;
	/** 내레이션이 시작하는 시각(초). 음성이 없으면 null */
	voiceAt: number | null;
}

/**
 * 컷을 0초부터 이어 붙인다. 내레이션이 컷보다 길면 원본이 남아 있는 만큼 컷을 늘리고,
 * 그래도 모자라면 다음 내레이션을 앞 음성이 끝난 뒤로 미룬다(음성끼리 겹치지 않는다)
 */
export function placeBeats({
	beats,
	voices,
	durations,
	pause,
}: {
	beats: EditBeat[];
	/** 컷마다 내레이션 음성 길이(초). 없으면 null */
	voices: (number | null)[];
	durations: Record<string, number>;
	pause: number;
}): PlacedBeat[] {
	let cursor = 0;
	let voiceEnd = 0;
	return beats.map((beat, index) => {
		const voice = voices[index];
		const voiceAt = voice === null ? null : Math.max(cursor, voiceEnd);
		const wanted = voiceAt === null || voice === null ? 0 : voiceAt + voice + pause - cursor;
		const length = Math.min(
			Math.max(beat.end - beat.start, wanted),
			durations[beat.clip] - beat.start,
		);
		const placed = { at: cursor, length, voiceAt };
		if (voiceAt !== null && voice !== null) voiceEnd = voiceAt + voice + pause;
		cursor += length;
		return placed;
	});
}
