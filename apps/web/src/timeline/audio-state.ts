import { hasKeyframesForPath } from "@/animation/keyframe-query";
import { resolveNumberAtTime } from "@/animation/values";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "./audio-constants";
import {
	CROSSFADE_CURVE,
	type CrossfadeExtent,
	type FadeCurveId,
	fadeGainAt,
	resolveCrossfades,
	toFadeCurveId,
} from "./audio-fade";
import type { TimelineElement } from "./types";
const DEFAULT_STEP_SECONDS = 1 / 60;

export type AudioCapableElement = Extract<
	TimelineElement,
	{ type: "audio" | "video" }
>;

export function clampDb(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.min(VOLUME_DB_MAX, Math.max(VOLUME_DB_MIN, value));
}

export function dBToLinear(db: number): number {
	return 10 ** (clampDb(db) / 20);
}

export function getElementVolume({
	element,
}: {
	element: AudioCapableElement;
}): number {
	const value = element.params.volume;
	return typeof value === "number" ? value : 0;
}

export function isElementMuted({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	return element.params.muted === true;
}

export function hasAnimatedVolume({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	return hasKeyframesForPath({
		animations: element.animations,
		propertyPath: "volume",
	});
}

import { roundMediaTime, TICKS_PER_SECOND } from "@/wasm";

/**
 * 크로스페이드로 앞을 늘린 가상 클립의 늘린 길이(초). 저장되지 않고 소리 계산에만 쓴다.
 * 볼륨 키프레임은 원래 클립 기준이라 이만큼 되돌려 읽는다
 */
const CROSSFADE_LEAD_PARAM = "crossfadeLead";

/** 클립 페이드 길이(초)와 곡선. 길이는 클립 길이를 넘지 않게 자른다 */
export function getElementFades({
	element,
}: {
	element: AudioCapableElement;
}): {
	fadeIn: number;
	fadeOut: number;
	fadeInCurve: FadeCurveId;
	fadeOutCurve: FadeCurveId;
} {
	const durationSeconds = element.duration / TICKS_PER_SECOND;
	const read = (value: unknown) =>
		typeof value === "number" && value > 0
			? Math.min(value, durationSeconds)
			: 0;
	return {
		fadeIn: read(element.params.fadeIn),
		fadeOut: read(element.params.fadeOut),
		fadeInCurve: toFadeCurveId(element.params.fadeInCurve),
		fadeOutCurve: toFadeCurveId(element.params.fadeOutCurve),
	};
}

function isAudioCapable(
	element: TimelineElement,
): element is AudioCapableElement {
	return element.type === "audio" || element.type === "video";
}

/** 한 트랙 안 맞붙은 클립들의 크로스페이드 구간(초) */
export function getCrossfadeExtents({
	elements,
}: {
	elements: readonly TimelineElement[];
}): Map<string, CrossfadeExtent> {
	return resolveCrossfades({
		spans: elements.filter(isAudioCapable).map((element) => {
			const rate = element.retime?.rate ?? 1;
			const crossfade = element.params.crossfade;
			return {
				id: element.id,
				start: element.startTime / TICKS_PER_SECOND,
				end: (element.startTime + element.duration) / TICKS_PER_SECOND,
				handleBefore: element.trimStart / TICKS_PER_SECOND / rate,
				handleAfter: element.trimEnd / TICKS_PER_SECOND / rate,
				crossfade: typeof crossfade === "number" ? crossfade : 0,
			};
		}),
	});
}

/**
 * 크로스페이드가 걸린 클립을 원본의 남은 부분만큼 앞뒤로 늘리고 그 구간에 페이드를 건다.
 * 소리를 모을 때만 쓰고 타임라인 데이터는 바꾸지 않는다
 */
export function applyCrossfades<TElement extends TimelineElement>({
	elements,
}: {
	elements: readonly TElement[];
}): TElement[] {
	const extents = getCrossfadeExtents({ elements });
	if (extents.size === 0) return [...elements];
	return elements.map((element) => {
		const extent = extents.get(element.id);
		if (!extent || !isAudioCapable(element)) return element;
		const rate = element.retime?.rate ?? 1;
		const beforeTicks = extent.before * TICKS_PER_SECOND;
		const afterTicks = extent.after * TICKS_PER_SECOND;
		return {
			...element,
			startTime: roundMediaTime({ time: element.startTime - beforeTicks }),
			duration: roundMediaTime({
				time: element.duration + beforeTicks + afterTicks,
			}),
			trimStart: roundMediaTime({
				time: element.trimStart - beforeTicks * rate,
			}),
			trimEnd: roundMediaTime({ time: element.trimEnd - afterTicks * rate }),
			params: {
				...element.params,
				[CROSSFADE_LEAD_PARAM]: extent.before,
				...(extent.fadeIn > 0
					? { fadeIn: extent.fadeIn, fadeInCurve: CROSSFADE_CURVE }
					: {}),
				...(extent.fadeOut > 0
					? { fadeOut: extent.fadeOut, fadeOutCurve: CROSSFADE_CURVE }
					: {}),
			},
		};
	});
}

export function hasElementFade({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	const { fadeIn, fadeOut } = getElementFades({ element });
	return fadeIn > 0 || fadeOut > 0;
}

/** 볼륨 키프레임이나 페이드처럼 클립 안에서 게인이 바뀌는가 */
export function hasGainAutomation({
	element,
}: {
	element: AudioCapableElement;
}): boolean {
	return hasAnimatedVolume({ element }) || hasElementFade({ element });
}

export function resolveFadeGain({
	element,
	localTime,
}: {
	element: AudioCapableElement;
	localTime: number;
}): number {
	return fadeGainAt({
		...getElementFades({ element }),
		durationSeconds: element.duration / TICKS_PER_SECOND,
		localTime,
	});
}

/** 볼륨·키프레임·페이드를 모두 반영한 클립 내부 시각의 게인 */
export function resolveAudioGainAtTime({
	element,
	trackMuted = false,
	localTime,
}: {
	element: AudioCapableElement;
	trackMuted?: boolean;
	localTime: number;
}): number {
	return (
		resolveEffectiveAudioGain({ element, trackMuted, localTime }) *
		resolveFadeGain({ element, localTime })
	);
}

export function resolveEffectiveAudioGain({
	element,
	trackMuted = false,
	localTime,
}: {
	element: AudioCapableElement;
	trackMuted?: boolean;
	localTime: number;
}): number {
	if (trackMuted || isElementMuted({ element })) {
		return 0;
	}

	const lead = element.params[CROSSFADE_LEAD_PARAM];
	const elementTime = localTime - (typeof lead === "number" ? lead : 0);
	const resolvedDb = resolveNumberAtTime({
		baseValue: getElementVolume({ element }),
		animations: element.animations,
		propertyPath: "volume",
		localTime: Math.round(elementTime * TICKS_PER_SECOND),
	});

	return dBToLinear(resolvedDb);
}

export function buildWaveformGainSamples({
	element,
	count,
}: {
	element: AudioCapableElement;
	count: number;
}): number[] {
	const durationSeconds = element.duration / TICKS_PER_SECOND;
	return Array.from({ length: count }, (_, i) => {
		const localTime = ((i + 0.5) / count) * durationSeconds;
		return resolveAudioGainAtTime({ element, localTime });
	});
}

export function buildAudioGainAutomation({
	element,
	trackMuted = false,
	fromLocalTime,
	toLocalTime,
	stepSeconds = DEFAULT_STEP_SECONDS,
}: {
	element: AudioCapableElement;
	trackMuted?: boolean;
	fromLocalTime: number;
	toLocalTime: number;
	stepSeconds?: number;
}): Array<{ localTime: number; gain: number }> {
	const startTime = Math.max(0, fromLocalTime);
	const endTime = Math.max(startTime, toLocalTime);
	const safeStep =
		Number.isFinite(stepSeconds) && stepSeconds > 0
			? stepSeconds
			: DEFAULT_STEP_SECONDS;
	const points: Array<{ localTime: number; gain: number }> = [];

	for (let localTime = startTime; localTime < endTime; localTime += safeStep) {
		points.push({
			localTime,
			gain: resolveAudioGainAtTime({
				element,
				trackMuted,
				localTime,
			}),
		});
	}

	points.push({
		localTime: endTime,
		gain: resolveAudioGainAtTime({
			element,
			trackMuted,
			localTime: endTime,
		}),
	});

	return points;
}

/** 같은 트랙에서 element 바로 뒤에 맞붙은 소리 클립 */
export function findAdjacentAudioClip({
	elements,
	element,
	side,
}: {
	elements: readonly TimelineElement[];
	element: TimelineElement;
	side: "before" | "after";
}): AudioCapableElement | null {
	return (
		elements.filter(isAudioCapable).find((other) =>
			side === "after"
				? other.startTime === element.startTime + element.duration
				: other.startTime + other.duration === element.startTime,
		) ?? null
	);
}

/**
 * 선택한 클립의 맞붙은 경계마다 크로스페이드를 건다. 이미 모두 걸려 있으면 뗀다.
 * 크로스페이드 길이는 경계 왼쪽 클립의 crossfade 값에 둔다
 */
export function buildCrossfadeToggleUpdates({
	tracks,
	selected,
	length,
}: {
	tracks: readonly { id: string; elements: readonly TimelineElement[] }[];
	selected: readonly { trackId: string; elementId: string }[];
	length: number;
}): Array<{
	trackId: string;
	elementId: string;
	patch: { params: Record<string, number> };
}> {
	const lefts = new Map<string, { trackId: string; element: AudioCapableElement }>();
	for (const { trackId, elementId } of selected) {
		const track = tracks.find((candidate) => candidate.id === trackId);
		const element = track?.elements.find((el) => el.id === elementId);
		if (!track || !element || !isAudioCapable(element)) continue;
		if (findAdjacentAudioClip({ elements: track.elements, element, side: "after" })) {
			lefts.set(element.id, { trackId, element });
		}
		const before = findAdjacentAudioClip({
			elements: track.elements,
			element,
			side: "before",
		});
		if (before) lefts.set(before.id, { trackId, element: before });
	}
	const hasCrossfade = (element: AudioCapableElement) => {
		const value = element.params.crossfade;
		return typeof value === "number" && value > 0;
	};
	const pairs = [...lefts.values()];
	const nextLength = pairs.every(({ element }) => hasCrossfade(element))
		? 0
		: length;
	return pairs.map(({ trackId, element }) => ({
		trackId,
		elementId: element.id,
		patch: { params: { crossfade: nextLength } },
	}));
}
