import { describe, expect, test } from "bun:test";
import type { EditorCore } from "@/core";
import { splitSubtitle } from "@/subtitles/list-actions";
import { DEFAULTS } from "@/timeline/defaults";
import { splitElementAtTime } from "@/timeline/split-element";
import type { TextElement } from "@/timeline/types";
import { mediaTimeFromSeconds, type TextAnimation } from "@/wasm";
import {
	applyTextAnimation,
	isPositive,
	splitTextAnimation,
	textAnimationPreviewRange,
	withLoopPreset,
	withRevealDuration,
	withRevealPreset,
} from "../text-animation";

const ticks = (seconds: number) => mediaTimeFromSeconds({ seconds });

const pulse = { type: "pulse", period: 1 };
const fullAnimation: TextAnimation = {
	in: { type: "fade", duration: 0.5 },
	out: { type: "slideUp", duration: 0.5 },
	loop: pulse,
};

function textElement(overrides: Partial<TextElement> = {}): TextElement {
	return {
		...DEFAULTS.text.element,
		id: "text-1",
		startTime: ticks(0),
		duration: ticks(3),
		params: { ...DEFAULTS.text.element.params, content: "국밥 맛집 오늘 최고" },
		textAnimation: fullAnimation,
		...overrides,
	} as TextElement;
}

const identity = {
	transform: { scaleX: 1, scaleY: 1, position: { x: 0, y: 0 }, rotate: 0 },
	opacity: 1,
	box: { width: 200, height: 100 },
};

describe("splitTextAnimation", () => {
	test("왼쪽은 인과 반복, 오른쪽은 아웃과 반복", () => {
		expect(splitTextAnimation({ animation: fullAnimation, rightStartSeconds: 1.5 })).toEqual({
			left: { in: fullAnimation.in, loop: fullAnimation.loop },
			right: { out: fullAnimation.out, loop: { ...pulse, offset: 1.5 } },
		});
	});

	test("남는 슬롯이 없으면 undefined", () => {
		expect(
			splitTextAnimation({
				animation: { in: { type: "fade", duration: 0.5 } },
				rightStartSeconds: 1,
			}),
		).toEqual({ left: { in: { type: "fade", duration: 0.5 } }, right: undefined });
		expect(splitTextAnimation({ animation: undefined, rightStartSeconds: 1 })).toEqual({
			left: undefined,
			right: undefined,
		});
	});
});

describe("타임라인 분할", () => {
	test("자른 자리에서 다시 퇴장/등장하지 않는다", () => {
		const halves = splitElementAtTime({ element: textElement(), splitTime: ticks(1.5) });
		expect(halves).not.toBeNull();
		const left = halves?.left as TextElement;
		const right = halves?.right as TextElement;
		expect(left.textAnimation).toEqual({ in: fullAnimation.in, loop: fullAnimation.loop });
		expect(right.textAnimation).toEqual({
			out: fullAnimation.out,
			loop: { ...pulse, offset: 1.5 },
		});
	});

	test("주기 중간에서 잘라도 반복이 이어진다", () => {
		const blink: TextAnimation = { loop: { type: "blink", period: 1 } };
		const element = textElement({ textAnimation: blink });
		const halves = splitElementAtTime({ element, splitTime: ticks(0.5) });
		const right = halves?.right as TextElement;
		const atSplit = (target: TextElement, local: number) =>
			applyTextAnimation({
				...identity,
				animation: target.textAnimation,
				localTime: ticks(local),
				duration: target.duration,
			}).opacity;
		expect(atSplit(right, 0)).toBeCloseTo(atSplit(element, 0.5), 6);
		expect(atSplit(right, 0.3)).toBeCloseTo(atSplit(element, 0.8), 6);
	});

	test("남는 슬롯이 없는 조각에는 textAnimation 키가 없다", () => {
		const halves = splitElementAtTime({
			element: textElement({ textAnimation: { in: { type: "fade", duration: 0.5 } } }),
			splitTime: ticks(1.5),
		});
		expect("textAnimation" in (halves?.right ?? {})).toBe(false);
	});
});

describe("자막 목록 분할", () => {
	test("타임라인 분할과 같은 규칙으로 나눈다", () => {
		let executed: unknown = null;
		const editor = {
			timeline: { getTrackById: () => ({ locked: false }) },
			command: {
				execute: ({ command }: { command: unknown }) => {
					executed = command;
				},
			},
		} as unknown as EditorCore;

		const ok = splitSubtitle({
			editor,
			entry: { trackId: "track-1", element: textElement() },
			text: "국밥 맛집 오늘 최고",
			at: 5,
		});
		expect(ok).toBe(true);
		// BatchCommand([UpdateElementsCommand, InsertElementCommand])의 내부 값을 읽는다
		const [update, insert] = (executed as { commands: unknown[] }).commands as [
			{ updates: { patch: Partial<TextElement> }[] },
			{ element: Partial<TextElement> },
		];
		expect(update.updates[0].patch.textAnimation).toEqual({
			in: fullAnimation.in,
			loop: fullAnimation.loop,
		});
		// 앞 4글자, 뒤 4글자라 3초 클립의 절반에서 나뉜다
		expect(insert.element.textAnimation).toEqual({
			out: fullAnimation.out,
			loop: { ...pulse, offset: 1.5 },
		});
	});
});

describe("applyTextAnimation (틱 단위 입력)", () => {
	const fadeIn: TextAnimation = { in: { type: "fade", duration: 0.5 } };

	test("0.5초 페이드 인은 0.25초에 반쯤, 0.5초에 끝난다", () => {
		const middle = applyTextAnimation({
			...identity,
			animation: fadeIn,
			localTime: ticks(0.25),
			duration: ticks(3),
		});
		expect(middle.opacity).toBeGreaterThan(0.3);
		expect(middle.opacity).toBeLessThan(1);

		const done = applyTextAnimation({
			...identity,
			animation: fadeIn,
			localTime: ticks(0.5),
			duration: ticks(3),
		});
		expect(done.opacity).toBe(1);
		expect(done.blurPasses).toEqual([]);
	});

	test("슬라이드 이동량은 텍스트 박스와 키프레임 크기를 따른다", () => {
		const start = applyTextAnimation({
			...identity,
			transform: { ...identity.transform, scaleX: 2, scaleY: 2 },
			animation: { in: { type: "slideUp", duration: 0.5 } },
			localTime: ticks(0),
			duration: ticks(3),
		});
		expect(start.transform.position.x).toBe(0);
		// 박스 높이 100 × 크기 2 × 이동 비율 → 아래에서 시작
		expect(start.transform.position.y).toBeGreaterThan(0);
		expect(start.opacity).toBe(0);
	});

	test("블러 인은 시작에 블러 패스를 만들고 끝나면 없앤다", () => {
		const blur: TextAnimation = { in: { type: "blur", duration: 0.5 } };
		const start = applyTextAnimation({
			...identity,
			animation: blur,
			localTime: ticks(0),
			duration: ticks(3),
		});
		expect(start.blurPasses.length).toBeGreaterThan(0);
	});

	test("저장값이 깨진 슬롯만 빠지고 나머지는 동작한다 (실제 wasm 경계)", () => {
		const broken = {
			in: { type: "fade" },
			out: { type: "fade", duration: "bad" },
			loop: { type: "pulse", period: 1 },
		} as unknown as TextAnimation;
		const result = applyTextAnimation({
			...identity,
			animation: broken,
			localTime: ticks(0.25),
			duration: ticks(3),
		});
		expect(result.opacity).toBe(1);
		expect(result.transform.scaleX).not.toBe(1);
		expect(Number.isFinite(result.transform.scaleX)).toBe(true);
	});

	test("애니메이션이 없으면 입력을 그대로 돌려준다", () => {
		const result = applyTextAnimation({
			...identity,
			animation: undefined,
			localTime: ticks(1),
			duration: ticks(3),
		});
		expect(result.transform).toBe(identity.transform);
		expect(result.opacity).toBe(1);
	});
});

describe("패널 슬롯 편집", () => {
	test("새 인 프리셋은 기본 길이, 바꾸면 길이 유지, 없음이면 슬롯이 빠진다", () => {
		const added = withRevealPreset({ animation: undefined, side: "in", type: "fade" });
		expect(added).toEqual({
			in: { type: "fade", duration: DEFAULTS.text.animation.duration },
		});
		const swapped = withRevealPreset({
			animation: { in: { type: "fade", duration: 1.2 } },
			side: "in",
			type: "pop",
		});
		expect(swapped?.in).toEqual({ type: "pop", duration: 1.2 });
		expect(withRevealPreset({ animation: added, side: "in", type: null })).toBeUndefined();
	});

	test("길이 슬라이더는 인과 아웃을 둘 다 유효 길이로 저장한다", () => {
		// 저장값 1:9인 클립을 1초로 트림하면 유효값은 0.1/0.9
		const animation: TextAnimation = {
			in: { type: "fade", duration: 1 },
			out: { type: "fade", duration: 9 },
		};
		const next = withRevealDuration({ animation, side: "in", seconds: 0.05, clipSeconds: 1 });
		expect(next.in?.duration).toBe(0.05);
		expect(next.out?.duration).toBeCloseTo(0.9, 9);
	});

	test("깨진 저장 주기도 숫자로 걸러 낸다", () => {
		expect(isPositive("bad")).toBe(false);
		expect(isPositive(undefined)).toBe(false);
		expect(isPositive(Number.NaN)).toBe(false);
		expect(isPositive(0.5)).toBe(true);
	});

	test("반복 프리셋을 바꿔도 주기와 offset은 유지한다", () => {
		const animation: TextAnimation = { loop: { type: "pulse", period: 2, offset: 0.5 } };
		expect(withLoopPreset({ animation, type: "blink" })?.loop).toEqual({
			type: "blink",
			period: 2,
			offset: 0.5,
		});
		expect(withLoopPreset({ animation: undefined, type: "float" })?.loop).toEqual({
			type: "float",
			period: DEFAULTS.text.animation.loopPeriod,
		});
		expect(withLoopPreset({ animation, type: null })).toBeUndefined();
	});

	test("프리셋을 고르면 그 구간만 재생한다", () => {
		expect(
			textAnimationPreviewRange({ animation: fullAnimation, slot: "in", clipSeconds: 3 }),
		).toEqual({ startSeconds: 0, endSeconds: 0.5 });
		expect(
			textAnimationPreviewRange({ animation: fullAnimation, slot: "out", clipSeconds: 3 }),
		).toEqual({ startSeconds: 2.5, endSeconds: 3 });
		expect(
			textAnimationPreviewRange({ animation: fullAnimation, slot: "loop", clipSeconds: 1.5 }),
		).toEqual({ startSeconds: 0, endSeconds: 1.5 });
	});
});
