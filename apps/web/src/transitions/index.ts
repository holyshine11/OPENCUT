import type { ElementTransition, TimelineElement } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";

/**
 * 컴포지터 전환 셰이더가 아는 전환. id는 rust/crates/compositor의 TransitionKind와 같은 문자열이다
 */
export const TRANSITION_TYPES = ["dissolve", "fadeBlack", "fadeWhite"] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

export function isTransitionType(value: string): value is TransitionType {
	return (TRANSITION_TYPES as readonly string[]).includes(value);
}

// 영상 하나를 잘라 붙인 경계에서는 전환 동안 같은 영상의 두 시점을 함께 그린다.
// 디코더 캐시는 키마다 한 시점만 들고 있어서, 전환으로 이어진 클립은 이 접미사를 붙인 키를 번갈아 쓴다
export const ALTERNATE_DECODER_SUFFIX = "#transition";

/** 한 경계에서 전환이 실제로 그려지는 구간(틱) */
export interface TransitionWindow {
	fromId: string;
	toId: string;
	type: TransitionType;
	start: number;
	duration: number;
}

/** 전환 구간만큼 클립을 앞뒤로 늘릴 길이(틱) */
export interface TransitionExtent {
	before: number;
	after: number;
}

type TransitionCapableElement = Extract<
	TimelineElement,
	{ type: "video" | "image" }
>;

function isTransitionCapable(
	element: TimelineElement,
): element is TransitionCapableElement {
	return element.type === "video" || element.type === "image";
}

/**
 * 한 트랙 안에서 맞붙은 영상·이미지 클립 사이의 전환 구간을 구한다.
 * 경계를 가운데에 두고, 전환 길이는 두 클립 중 짧은 쪽 길이를 넘지 않는다.
 * 그래서 한 클립 앞뒤에 걸린 두 전환 구간은 겹치지 않는다.
 * 타임라인 데이터는 바꾸지 않고, 렌더할 때만 두 클립을 구간만큼 늘린다
 */
export function resolveTransitionWindows({
	elements,
}: {
	elements: readonly TimelineElement[];
}): { windows: TransitionWindow[]; extents: Map<string, TransitionExtent> } {
	const sorted = elements
		.filter(isTransitionCapable)
		.filter((element) => !element.hidden)
		.sort((a, b) => a.startTime - b.startTime);
	const windows: TransitionWindow[] = [];
	const extents = new Map<string, TransitionExtent>();
	const extentOf = (id: string) => extents.get(id) ?? { before: 0, after: 0 };

	for (let i = 0; i < sorted.length - 1; i++) {
		const left = sorted[i];
		const right = sorted[i + 1];
		const transition = left.transition;
		if (!transition || !isTransitionType(transition.type)) continue;
		const cut = left.startTime + left.duration;
		if (right.startTime !== cut) continue;

		const duration = Math.min(
			Math.round(transition.duration * TICKS_PER_SECOND),
			left.duration,
			right.duration,
		);
		if (duration <= 0) continue;
		const before = Math.floor(duration / 2);
		const after = duration - before;

		windows.push({
			fromId: left.id,
			toId: right.id,
			type: transition.type,
			start: cut - before,
			duration,
		});
		extents.set(left.id, { ...extentOf(left.id), after });
		extents.set(right.id, { ...extentOf(right.id), before });
	}
	return { windows, extents };
}

/**
 * 선택한 클립마다 바로 뒤 경계에 전환을 건다. 뒤에 맞붙은 클립이 없으면 앞 경계에 건다.
 * transition이 없으면 그 경계의 전환을 뗀다
 */
export function buildTransitionUpdates({
	tracks,
	selected,
	transition,
}: {
	tracks: readonly { id: string; elements: readonly TimelineElement[] }[];
	selected: readonly { trackId: string; elementId: string }[];
	transition: ElementTransition | undefined;
}): Array<{
	trackId: string;
	elementId: string;
	patch: { transition: ElementTransition | undefined };
}> {
	const lefts = new Map<string, string>();
	for (const { trackId, elementId } of selected) {
		const track = tracks.find((candidate) => candidate.id === trackId);
		const element = track?.elements.find((el) => el.id === elementId);
		if (!track || !element || !isTransitionCapable(element)) continue;
		const clips = track.elements.filter(isTransitionCapable);
		const end = element.startTime + element.duration;
		const hasNext = clips.some((other) => other.startTime === end);
		const previous = clips.find(
			(other) => other.startTime + other.duration === element.startTime,
		);
		if (hasNext) lefts.set(element.id, trackId);
		else if (previous) lefts.set(previous.id, trackId);
	}
	return [...lefts].map(([elementId, trackId]) => ({
		trackId,
		elementId,
		patch: { transition },
	}));
}
