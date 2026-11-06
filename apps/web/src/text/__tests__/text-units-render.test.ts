import { describe, expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import type { TextCanvasContext } from "../layout";
import { drawMeasuredTextLayout, measureTextLayout } from "../primitives";
import { buildTextUnits, type ResolvedTextUnit } from "../text-units";
import { drawTextAnimationThumbnail } from "../components/text-animation-thumbnail";
import { textAnimationPresets } from "@/wasm";
import { en } from "@/i18n/messages/en";
import { ko } from "@/i18n/messages/ko";

// 반투명 조각의 임시 캔버스. 테스트 환경에는 OffscreenCanvas가 없어 napi 캔버스로 대신한다
(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas ??= function OffscreenCanvas(
	width: number,
	height: number,
) {
	return createCanvas(width, height);
};

const WIDTH = 320;
const HEIGHT = 160;

function render({
	units,
	fillOpacity,
	stroke,
	shadow,
	textAlign,
	background = false,
}: {
	background?: boolean;
	units: "lines" | "identity" | "half";
	fillOpacity: number;
	stroke: boolean;
	shadow: boolean;
	textAlign: "left" | "center" | "right";
}): Uint8ClampedArray {
	const canvas = createCanvas(WIDTH, HEIGHT);
	const ctx = canvas.getContext("2d") as unknown as TextCanvasContext;
	const layout = measureTextLayout({
		text: {
			content: "AV 국밥\nfi!",
			fontSize: 15,
			fontFamily: "sans-serif",
			fontWeight: "bold",
			fontStyle: "normal",
			textAlign,
			textDecoration: "underline",
		},
		canvasHeight: HEIGHT * 2,
		ctx,
	});
	const resolved: ResolvedTextUnit[] | null =
		units === "lines"
			? null
			: buildTextUnits({ layout, ctx }).units.map((unit) => ({
					...unit,
					dx: 0,
					dy: 0,
					scale: 1,
					stretchX: 1,
					stretchY: 1,
					rotate: 0,
					opacity: units === "half" ? 0.5 : 1,
				}));
	ctx.translate(WIDTH / 2, HEIGHT / 2);
	drawMeasuredTextLayout({
		ctx,
		layout,
		textColor: "#ffcc00",
		fillOpacity,
		stroke: stroke ? { color: "#000000", width: 8 } : null,
		shadow: shadow ? { color: "rgba(255,0,0,0.6)", blur: 6, offsetX: 4, offsetY: 4 } : null,
		background: background
			? { enabled: true, color: "#0033ff", paddingX: 20, paddingY: 10, offsetX: 0, offsetY: 0, cornerRadius: 0 }
			: null,
		backgroundColor: background ? "#0033ff" : undefined,
		units: resolved,
	});
	return ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
}

/** 두 그림에서 알파나 색이 tolerance보다 크게 다른 픽셀 수 */
function differingPixels(a: Uint8ClampedArray, b: Uint8ClampedArray, tolerance = 8): number {
	let count = 0;
	for (let i = 0; i < a.length; i += 4) {
		const delta = Math.max(
			Math.abs(a[i] - b[i]),
			Math.abs(a[i + 1] - b[i + 1]),
			Math.abs(a[i + 2] - b[i + 2]),
			Math.abs(a[i + 3] - b[i + 3]),
		);
		if (delta > tolerance) count += 1;
	}
	return count;
}

describe("유닛 그리기는 정지 상태에서 줄 그리기와 같은 그림을 낸다", () => {
	const cases = [
		{ stroke: false, shadow: false, fillOpacity: 1 },
		{ stroke: false, shadow: true, fillOpacity: 1 },
		{ stroke: true, shadow: false, fillOpacity: 1 },
		{ stroke: true, shadow: true, fillOpacity: 1 },
		{ stroke: false, shadow: false, fillOpacity: 0 },
		{ stroke: false, shadow: true, fillOpacity: 1, background: true },
		{ stroke: true, shadow: true, fillOpacity: 1, background: true },
	];
	for (const textAlign of ["left", "center", "right"] as const) {
		for (const options of cases) {
			test(`${textAlign} ${JSON.stringify(options)}`, () => {
				const lines = render({ units: "lines", textAlign, ...options });
				const units = render({ units: "identity", textAlign, ...options });
				// 글자마다 소수점 x에 따로 놓여 안티앨리어싱 몇 픽셀은 다를 수 있다
				expect(differingPixels(lines, units)).toBeLessThan(40);
			});
		}
	}

	// 채움 투명도 < 1이면서 외곽선/그림자가 있는 합성(destination-out)은 napi 캔버스가 줄/조각 모두
	// Chrome과 다르게 그려 여기서 비교하지 않는다. 그 조합은 실제 앱(Chrome)에서 확인한다

	test("반투명 조각은 외곽선 안쪽이 비치지 않고 전체를 한 번에 흐리게 한다", () => {
		const opaque = render({ units: "identity", stroke: true, shadow: false, fillOpacity: 1, textAlign: "center" });
		const half = render({ units: "half", stroke: true, shadow: false, fillOpacity: 1, textAlign: "center" });
		// 반투명 조각의 알파는 불투명 그림의 절반 근처여야 한다 (외곽선과 채움이 겹쳐 더 진해지지 않음).
		// 이웃 글자끼리 겹치는 자리(커닝 쌍, 밑줄 이음매)는 두 조각이 겹쳐 더 진한 게 맞다
		let checked = 0;
		let halfAlpha = 0;
		for (let i = 3; i < opaque.length; i += 4) {
			if (opaque[i] !== 255) continue;
			checked += 1;
			if (Math.abs(half[i] - 128) < 4) halfAlpha += 1;
		}
		expect(checked).toBeGreaterThan(100);
		expect(halfAlpha / checked).toBeGreaterThan(0.95);
	});

	test("조각 투명도가 1이 되는 순간 그림자와 글자의 앞뒤가 바뀌지 않는다", () => {
		const draw = (opacity: number) => {
			const canvas = createCanvas(WIDTH, HEIGHT);
			const ctx = canvas.getContext("2d") as unknown as TextCanvasContext;
			const layout = measureTextLayout({
				text: {
					content: "HH",
					fontSize: 30,
					fontFamily: "sans-serif",
					fontWeight: "bold",
					fontStyle: "normal",
					textAlign: "center",
				},
				canvasHeight: HEIGHT * 2,
				ctx,
			});
			const units = buildTextUnits({ layout, ctx }).units.map((unit) => ({
				...unit,
				dx: 0,
				dy: 0,
				scale: 1,
				stretchX: 1,
				stretchY: 1,
				rotate: 0,
				opacity,
			}));
			ctx.translate(WIDTH / 2, HEIGHT / 2);
			// 그림자를 왼쪽으로 크게 밀어 뒤 글자의 그림자가 앞 글자 위치에 떨어지게 한다
			drawMeasuredTextLayout({
				ctx,
				layout,
				textColor: "#ffffff",
				shadow: { color: "#ff0000", blur: 0, offsetX: -60, offsetY: 0 },
				units,
			});
			return ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
		};
		expect(differingPixels(draw(0.999999), draw(1))).toBeLessThan(40);
	});

	test("배경이 있을 때 반투명 조각의 채움 지우기가 배경을 뚫지 않는다", () => {
		const options = { stroke: true, shadow: false, fillOpacity: 0, textAlign: "center" as const, background: true };
		const opaque = render({ units: "identity", ...options });
		const almost = render({ units: "half", ...options });
		// 배경은 조각 투명도와 상관없이 그대로 불투명해야 한다
		let backgroundPixels = 0;
		let holes = 0;
		for (let i = 0; i < opaque.length; i += 4) {
			const isBackground =
				opaque[i] === 0 && opaque[i + 1] === 0x33 && opaque[i + 2] === 0xff && opaque[i + 3] === 255;
			if (!isBackground) continue;
			backgroundPixels += 1;
			if (almost[i + 3] < 250) holes += 1;
		}
		expect(backgroundPixels).toBeGreaterThan(1000);
		expect(holes).toBe(0);
	});

	test("같은 투명도의 겹친 글자가 함께 불투명해지는 순간 외곽선 순서가 바뀌지 않는다", () => {
		const draw = (opacity: number) => {
			const canvas = createCanvas(WIDTH, HEIGHT);
			const ctx = canvas.getContext("2d") as unknown as TextCanvasContext;
			const layout = measureTextLayout({
				text: {
					content: "HH",
					fontSize: 25,
					fontFamily: "sans-serif",
					fontWeight: "bold",
					fontStyle: "normal",
					textAlign: "center",
					letterSpacing: -20,
				},
				canvasHeight: HEIGHT * 2,
				ctx,
			});
			const units = buildTextUnits({ layout, ctx }).units.map((unit) => ({
				...unit,
				dx: 0,
				dy: 0,
				scale: 1,
				stretchX: 1,
				stretchY: 1,
				rotate: 0,
				opacity,
			}));
			ctx.translate(WIDTH / 2, HEIGHT / 2);
			drawMeasuredTextLayout({
				ctx,
				layout,
				textColor: "#ffffff",
				stroke: { color: "#ff0000", width: 8 },
				units,
			});
			return ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
		};
		expect(differingPixels(draw(0.999999), draw(1))).toBeLessThan(40);
	});

	test("겹친 여러 줄도 정지 상태에서 줄 그리기와 같은 순서로 그린다 (그림자 포함)", () => {
		const draw = (mode: "lines" | "units", withShadow = false) => {
			const canvas = createCanvas(WIDTH, HEIGHT);
			const ctx = canvas.getContext("2d") as unknown as TextCanvasContext;
			const layout = measureTextLayout({
				text: {
					content: "HH\nHH",
					fontSize: 30,
					fontFamily: "sans-serif",
					fontWeight: "bold",
					fontStyle: "normal",
					textAlign: "center",
					lineHeight: 0.5,
				},
				canvasHeight: HEIGHT * 2,
				ctx,
			});
			const units =
				mode === "lines"
					? null
					: buildTextUnits({ layout, ctx }).units.map((unit) => ({
							...unit,
							dx: 0,
							dy: 0,
							scale: 1,
							stretchX: 1,
							stretchY: 1,
							rotate: 0,
							opacity: 1,
						}));
			ctx.translate(WIDTH / 2, HEIGHT / 2);
			drawMeasuredTextLayout({
				ctx,
				layout,
				textColor: "#ffffff",
				stroke: withShadow ? null : { color: "#ff0000", width: 8 },
				// 그림자를 위로 크게 밀어 아래 줄의 그림자가 위 줄 글자 위에 떨어지게 한다
				shadow: withShadow ? { color: "#ff0000", blur: 0, offsetX: 0, offsetY: -30 } : null,
				units,
			});
			return ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
		};
		expect(differingPixels(draw("lines"), draw("units"))).toBeLessThan(40);
		expect(differingPixels(draw("lines", true), draw("units", true))).toBeLessThan(40);
	});

	// 반투명 글자 속으로 자기 그림자가 비치지 않는지는 destination-out 텍스트 합성이라 napi 캔버스로 확인할 수
	// 없다. Chrome 캔버스에서 같은 순서로 재현해 확인했다(불투명 그림을 50%로 얹은 기준과 가장자리 몇 픽셀만 다름)
});

describe("프리셋 썸네일", () => {
	const presets = textAnimationPresets();
	const draw = (slot: "in" | "out" | "loop", type: string, seconds: number) => {
		const canvas = createCanvas(64, 64);
		const ctx = canvas.getContext("2d") as unknown as TextCanvasContext;
		drawTextAnimationThumbnail({
			ctx,
			slot,
			type,
			seconds,
			content: "가나다",
			fontFamily: "sans-serif",
			color: "#ffffff",
		});
		return ctx.getImageData(0, 0, 64, 64).data;
	};
	const inked = (data: Uint8ClampedArray) => data.filter((_, i) => i % 4 === 3 && data[i] > 0).length;

	test("모든 프리셋이 정지 화면에서 무언가를 그리고, 인이 끝나면 정지 상태와 같다", () => {
		const rest = draw("loop", "none", 0);
		expect(inked(rest)).toBeGreaterThan(50);
		for (const type of presets.reveal) {
			expect(inked(draw("in", type, 0.3))).toBeGreaterThan(0);
			expect(inked(draw("out", type, 0.7))).toBeGreaterThan(0);
			expect(differingPixels(draw("in", type, 1), rest)).toBeLessThan(20);
		}
		for (const type of presets.loop) expect(inked(draw("loop", type, 0.25))).toBeGreaterThan(0);
	});

	test("모든 프리셋에 한국어와 영어 이름이 있다", () => {
		for (const type of [...presets.reveal, ...presets.loop]) {
			expect(ko.properties.textAnimation.presets[type]).toBeString();
			expect(en.properties.textAnimation.presets[type]).toBeString();
		}
	});

	test("글리치는 빨강과 청록 잔상을 그리고, 다 나타나면 잔상이 없다", () => {
		const tinted = (data: Uint8ClampedArray) => {
			let red = 0;
			let cyan = 0;
			for (let i = 0; i < data.length; i += 4) {
				if (data[i + 3] === 0) continue;
				if (data[i] > 200 && data[i + 1] < 120) red++;
				if (data[i] < 120 && data[i + 2] > 200) cyan++;
			}
			return { red, cyan };
		};
		const frames = Array.from({ length: 20 }, (_, i) => tinted(draw("loop", "glitch", i / 20)));
		expect(frames.some(({ red, cyan }) => red > 0 && cyan > 0)).toBe(true);
		expect(tinted(draw("in", "glitchIn", 1))).toEqual({ red: 0, cyan: 0 });
	});

	describe("글리치 잔상 합성", () => {
		const paint = ({
			split,
			background = false,
			fillOpacity = 1,
			stroke = false,
		}: { split: number; background?: boolean; fillOpacity?: number; stroke?: boolean }) => {
			const canvas = createCanvas(WIDTH, HEIGHT);
			const ctx = canvas.getContext("2d") as unknown as TextCanvasContext;
			const layout = measureTextLayout({
				text: { content: "HH", fontSize: 30, fontFamily: "sans-serif", fontWeight: "bold", fontStyle: "normal", textAlign: "center" },
				canvasHeight: HEIGHT,
				ctx,
			});
			ctx.translate(WIDTH / 2, HEIGHT / 2);
			drawMeasuredTextLayout({
				ctx,
				layout,
				textColor: "#ffffff",
				fillOpacity,
				stroke: stroke ? { color: "#ffffff", width: 1 } : null,
				background: background
					? { enabled: true, color: "#000000", cornerRadius: 0, paddingX: 40, paddingY: 20, offsetX: 0, offsetY: 0 }
					: null,
				backgroundColor: "#000000",
				split,
			});
			return ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
		};
		const tintedCount = (data: Uint8ClampedArray) => {
			let count = 0;
			for (let i = 0; i < data.length; i += 4) {
				const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
				if (data[i + 3] > 0 && Math.max(r, g, b) - Math.min(r, g, b) > 80) count++;
			}
			return count;
		};

		test("불투명 배경 위에 잔상이 보인다", () => {
			expect(tintedCount(paint({ split: 6, background: true }))).toBeGreaterThan(100);
			expect(tintedCount(paint({ split: 0, background: true }))).toBe(0);
		});

		test("반투명 채움과 외곽선의 지우기 합성이 잔상을 지우지 않는다", () => {
			// 채움이 비면 글자 속으로 잔상이 비쳐야 하므로 불투명 채움일 때보다 색 픽셀이 많다
			const opaque = tintedCount(paint({ split: 3, stroke: true }));
			const hollow = tintedCount(paint({ split: 3, stroke: true, fillOpacity: 0 }));
			expect(hollow).toBeGreaterThan(opaque);
		});
	});
});
