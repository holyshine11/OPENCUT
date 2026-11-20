import { ADJUST_PRESETS } from "@/effects/definitions/adjust-presets";
import { isTransitionType, type TransitionType } from "@/transitions";

/** 쇼츠(세로)·롱폼(가로). 화면 크기는 여기서만 정한다 */
export const FORMATS = {
	short: { width: 1080, height: 1920 },
	long: { width: 1920, height: 1080 },
} as const;
export type EditFormat = keyof typeof FORMATS;
export const FORMAT_IDS: EditFormat[] = ["short", "long"];

/** 강조 컷에 줄 화면 효과. zoom은 화면을 당겨 잡고, 나머지는 effects 레지스트리의 효과 id다 */
export const IMPACTS = ["zoom", "zoom-blur", "rgb-split", "glitch", "glow", "old-film"] as const;
export type Impact = (typeof IMPACTS)[number];

/** 프레임 왼쪽 위가 (0,0), 오른쪽 아래가 (1,1)인 영역 */
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface EditBeat {
	clip: string;
	start: number;
	end: number;
	narration: string;
	/** 내레이션을 읽을 목소리. 기본은 아내 */
	voice: "wife" | "husband";
	caption: string;
	transition: TransitionType | null;
	/** 효과음 파일 이름 */
	sfx: string | null;
	/** 효과음이 떨어질 내레이션 속 낱말. 비었거나 내레이션에 없으면 내레이션(없으면 컷) 시작이다 */
	sfxOn: string;
	impact: Impact | null;
	/** 모자이크로 가릴 영역(얼굴·속옷) */
	mosaic: Box[];
}

export interface EditPlan {
	concept: string;
	hook: string;
	/** ADJUST_PRESETS의 id. 모르는 값이면 null */
	look: string | null;
	/** 영상 전체에 깔 배경음악 파일 이름 */
	bgm: string | null;
	beats: EditBeat[];
	youtube: { title: string; description: string; tags: string[] };
	review: string[];
}

export const MIN_BEAT_SECONDS = 0.5;
// Claude는 3초에 한 장꼴인 스틸로 위치를 어림한다. 컷 안에서 움직여도 덮이게 넉넉히 키운다
const MOSAIC_PADDING = 1.6;
const MOSAIC_MIN_SIDE = 0.12;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** 모델이 준 영역을 넉넉히 키워 프레임 안으로 자른다. 숫자가 아니면 버린다 */
function parseBox(item: unknown): Box[] {
	const { x, y, w, h } = record(item);
	const [left, top, width, height] = [x, y, w, h].map(Number);
	if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return [];
	const paddedW = Math.max(width * MOSAIC_PADDING, MOSAIC_MIN_SIDE);
	const paddedH = Math.max(height * MOSAIC_PADDING, MOSAIC_MIN_SIDE);
	const x0 = clamp01(left + width / 2 - paddedW / 2);
	const y0 = clamp01(top + height / 2 - paddedH / 2);
	const x1 = clamp01(left + width / 2 + paddedW / 2);
	const y1 = clamp01(top + height / 2 + paddedH / 2);
	return x1 > x0 && y1 > y0 ? [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }] : [];
}

export const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const texts = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);
/** 객체가 아니면 빈 객체. 밖에서 온 JSON을 읽을 때 쓴다 */
export const record = (value: unknown): Record<string, unknown> =>
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 객체인지 확인한 뒤다
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/** 모델 메시지에 섞인 설명을 떼고 JSON 객체만 읽는다. 없으면 던진다 */
export function parseObject(output: string): Record<string, unknown> {
	const start = output.indexOf("{");
	const end = output.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("no plan");
	return record(JSON.parse(output.slice(start, end + 1)));
}

type Limits = {
	/** 클립 번호 → 길이(초) */
	durations: Record<string, number>;
	/** 쓸 수 있는 효과음 파일 이름 */
	sounds?: string[];
	/** 쓸 수 있는 배경음악 파일 이름 */
	bgms?: string[];
};

// macOS 파일 이름은 한글 자모가 풀려(NFD) 있는데 모델은 붙여서(NFC) 돌려준다. 같은 이름으로 보고 목록의 이름을 쓴다
const findFile = ({ name, files = [] }: { name: unknown; files?: string[] }) =>
	files.find((file) => file.normalize("NFC") === text(name).normalize("NFC")) ?? null;

/** 모델이 준 컷 하나. 모르는 클립이거나 너무 짧으면 버리고, 구간은 클립 안으로 자른다 */
function parseBeat({ item, durations, sounds }: Limits & { item: unknown }): EditBeat[] {
	const beat = record(item);
	const clip = text(beat.clip);
	const duration = durations[clip];
	if (duration === undefined) return [];
	const from = Math.max(0, Number(beat.start));
	const to = Math.min(duration, Number(beat.end));
	if (!(to - from >= MIN_BEAT_SECONDS)) return [];
	const transition = text(beat.transition);
	const impact = IMPACTS.find((item) => item === text(beat.impact));
	return [
		{
			clip,
			start: from,
			end: to,
			narration: text(beat.narration),
			voice: beat.voice === "husband" ? "husband" : "wife",
			caption: text(beat.caption),
			transition: isTransitionType(transition) ? transition : null,
			sfx: findFile({ name: beat.sfx, files: sounds }),
			sfxOn: text(beat.sfxOn),
			impact: impact ?? null,
			mosaic: (Array.isArray(beat.mosaic) ? beat.mosaic : []).flatMap(parseBox),
		},
	];
}

/**
 * Claude가 낸 마지막 메시지에서 계획을 꺼낸다. 모델 출력은 믿지 않는다:
 * 모르는 클립·길이를 벗어난 구간은 버리거나 클립 안으로 자른다. 쓸 컷이 하나도 없으면 던진다
 */
export function parsePlan({ output, durations, sounds, bgms }: Limits & { output: string }): EditPlan {
	const raw = parseObject(output);
	const beats = (Array.isArray(raw.beats) ? raw.beats : []).flatMap((item) =>
		parseBeat({ item, durations, sounds }),
	);
	if (beats.length === 0) throw new Error("no usable beats");

	const youtube = record(raw.youtube);
	const look = text(raw.look);
	return {
		concept: text(raw.concept),
		hook: text(raw.hook),
		look: ADJUST_PRESETS.some((preset) => preset.id === look) ? look : null,
		bgm: findFile({ name: raw.bgm, files: bgms }),
		beats,
		youtube: {
			title: text(youtube.title),
			description: text(youtube.description),
			tags: texts(youtube.tags),
		},
		review: texts(raw.review),
	};
}

/**
 * 다듬을 범위와, 그 범위에서 Claude가 고칠 수 있는 컷 항목. 범위 밖의 수정은 받지 않는다.
 * all은 전부 고칠 수 있다(색 보정·제목 포함). 컷을 넣고 빼는 건 all과 cuts만 하고, 배경음악은 all과 bgm만 바꾼다
 */
export const REVISE_SCOPES = {
	script: ["narration", "voice"],
	sfx: ["sfx", "sfxOn"],
	cuts: ["clip", "start", "end", "transition"],
	captions: ["caption"],
	narration: ["narration", "voice", "end"],
	bgm: [],
	all: null,
} as const;
export type ReviseScope = keyof typeof REVISE_SCOPES;
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 위 객체의 키 그대로다
export const REVISE_SCOPE_IDS = Object.keys(REVISE_SCOPES) as ReviseScope[];

/**
 * 이미 편집한 계획에 Claude가 낸 수정 사항(changes)만 얹는다. 컷 번호는 고치기 전 계획의 순서(1부터)다.
 * 손대지 않은 컷은 그대로 남고, 못 쓰는 수정(모르는 클립, 너무 짧은 구간)은 버리고 원래 컷을 둔다.
 * changed가 false면 고칠 게 없었다는 뜻이라 타임라인을 다시 짤 필요가 없다
 */
export function revisePlan({
	previous,
	output,
	durations,
	sounds,
	bgms,
	scope = "all",
}: Limits & { previous: EditPlan; output: string; scope?: ReviseScope }): { plan: EditPlan; changed: boolean } {
	const all = scope === "all";
	const fields: readonly string[] | null = REVISE_SCOPES[scope];
	const reshapes = all || scope === "cuts";
	const parsed = parseObject(output);
	const raw = all ? parsed : { changes: parsed.changes, review: parsed.review };
	const oldBgm = previous.bgm ?? null;
	// null은 빼라는 뜻이고, 목록에 없는 이름은 무시한다
	const bgm =
		(all || scope === "bgm") && "bgm" in parsed
			? parsed.bgm === null
				? null
				: (findFile({ name: parsed.bgm, files: bgms }) ?? oldBgm)
			: oldBgm;
	const changes = (Array.isArray(raw.changes) ? raw.changes : []).map(record);
	const addedAfter = (number: number) =>
		changes
			.filter((change) => reshapes && "add" in change && Number(change.after) === number)
			.flatMap((change) => parseBeat({ item: change.add, durations, sounds }));

	const beats = addedAfter(0);
	for (const [index, old] of previous.beats.entries()) {
		const own = changes.filter((change) => Number(change.beat) === index + 1);
		// 그사이 미디어 패널에서 지운 클립의 컷도 뺀다
		if (durations[old.clip] !== undefined && !own.some((change) => reshapes && change.remove === true)) {
			const wanted: Record<string, unknown> = Object.assign({}, ...own.map((change) => record(change.set)));
			const set = Object.fromEntries(Object.entries(wanted).filter(([key]) => !fields || fields.includes(key)));
			const [next] = Object.keys(set).length > 0 ? parseBeat({ item: { ...old, ...set }, durations, sounds }) : [];
			// 안 고친 모자이크는 그대로 둔다(다시 읽으면 영역을 또 키운다)
			beats.push(next ? ("mosaic" in set ? next : { ...next, mosaic: old.mosaic }) : old);
		}
		beats.push(...addedAfter(index + 1));
	}
	if (beats.length === 0) throw new Error("no usable beats");

	const youtube = record(raw.youtube);
	const look = text(raw.look);
	const tags = texts(youtube.tags);
	const plan: EditPlan = {
		concept: text(raw.concept) || previous.concept,
		hook: text(raw.hook) || previous.hook,
		look: ADJUST_PRESETS.some((preset) => preset.id === look) ? look : previous.look,
		bgm,
		beats,
		youtube: {
			title: text(youtube.title) || previous.youtube.title,
			description: text(youtube.description) || previous.youtube.description,
			tags: tags.length > 0 ? tags : previous.youtube.tags,
		},
		review: texts(raw.review),
	};
	const comparable = ({ review: _review, ...rest }: EditPlan) => JSON.stringify(rest);
	// 배경음악이 생기기 전에 저장된 계획에는 bgm이 없다
	return { plan, changed: comparable(plan) !== comparable({ ...previous, bgm: oldBgm }) };
}

/**
 * 효과음이 떨어질 시각(초). 채널 영상의 효과음은 컷 전환이 아니라 말에 붙어 있다.
 * sfxOn 낱말이 내레이션에 있으면 음성이 고르게 읽힌다고 보고 그 낱말 자리, 없으면 내레이션(없으면 컷) 시작이다
 */
export function sfxTime({
	beat,
	placed,
	voice,
}: {
	beat: Pick<EditBeat, "narration" | "sfxOn">;
	placed: PlacedBeat;
	/** 그 컷 내레이션의 음성 길이(초). 없으면 null */
	voice: number | null;
}): number {
	if (placed.voiceAt === null || voice === null) return placed.at;
	const index = beat.sfxOn ? beat.narration.indexOf(beat.sfxOn) : -1;
	return placed.voiceAt + (index > 0 ? (voice * index) / beat.narration.length : 0);
}

export interface PlacedBeat {
	/** 타임라인에서 컷이 시작하는 시각(초) */
	at: number;
	/** 컷 길이(초) */
	length: number;
	/** 내레이션이 시작하는 시각(초). 음성이 없으면 null */
	voiceAt: number | null;
}

/** 타임라인에 실제로 놓인 컷 길이와 그 컷 내레이션의 음성 길이(초). 다음에 다듬을 때 Claude에게 알려 준다 */
export interface BeatTiming {
	length: number;
	voice: number | null;
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
	beats: Pick<EditBeat, "clip" | "start" | "end">[];
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

/** 화면을 꽉 채우려면 원본을 몇 배로 키워야 하는지. 렌더러는 기본으로 화면 안에 다 들어오게(contain) 맞춘다 */
export function coverScale({
	source,
	canvas,
}: {
	source: { width: number; height: number };
	canvas: { width: number; height: number };
}): number {
	const x = canvas.width / source.width;
	const y = canvas.height / source.height;
	return Math.max(x, y) / Math.min(x, y);
}

// 내레이션 TTS 합성 속도(서버 최대값). 합성 서버가 직접 빨리 읽게 한다 — 1배속으로 만들어 편집기에서 1.2배로 줄이면
// 발음 오류가 늘고(송강 CER 0.17 → 0.31) 직접 읽게 하면 덜하다(0.23). 빨리 읽으면 끝 올림도 줄어든다. 측정 2026-11-15
export const NARRATION_RATE = 1.2;

// 믹싱 기준(dB). 내레이션(TTS 서버가 -16 LUFS로 맞춰 준다)을 0으로 두고 나머지를 그 아래에 깐다
export const MIX = {
	/** 내레이션이 깔리는 컷의 현장음. 조리 소리는 남기되 목소리를 가리지 않는다 */
	sourceUnderVoice: -14,
	/** 내레이션이 없는 컷의 현장음. 목소리 컷과 번갈아 나와도 튀지 않게 한다 */
	source: -6,
	/** 효과음이 실제로 들려야 하는 크기(소리 나는 구간의 RMS, dBFS) */
	sfxTarget: -22,
	/** 내레이션과 겹치는 효과음은 이만큼 더 낮춘다 */
	sfxUnderVoice: -4,
	sfxMin: -24,
	sfxMax: 6,
	/** 배경음악(번들 곡은 -16 LUFS로 맞춰 둠). 채널 영상에서 말 사이에 깔린 소리가 목소리보다 17~20dB 낮았다 */
	bgm: -20,
	/** 배경음악이 시작하고 끝날 때의 페이드(초) */
	bgmFade: 1.5,
	/** 컷 경계에서 딱 소리가 나지 않게 하는 짧은 페이드(초) */
	fade: 0.03,
} as const;

/** 효과음 파일마다 녹음 크기가 다르다. 잰 크기(loudness, dBFS)를 기준 크기로 맞추는 볼륨(dB) */
export function sfxVolume({ loudness, underVoice }: { loudness: number | null; underVoice: boolean }): number {
	const gain = loudness === null ? MIX.sfxMin / 2 : MIX.sfxTarget - loudness;
	return Math.min(MIX.sfxMax, Math.max(MIX.sfxMin, gain + (underVoice ? MIX.sfxUnderVoice : 0)));
}

/** 소리가 나는 구간만 잰 RMS(dBFS). 앞뒤 무음이 긴 효과음도 실제 크기대로 나온다. 전부 무음이면 null */
export function activeLoudness(samples: Float32Array): number | null {
	let sum = 0;
	let count = 0;
	for (const sample of samples) {
		if (Math.abs(sample) < 0.01) continue;
		sum += sample * sample;
		count++;
	}
	return count === 0 ? null : 10 * Math.log10(sum / count);
}
