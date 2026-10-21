import { describe, expect, test } from "bun:test";
import {
	fineDragTime,
	keepsSourceTrack,
} from "@/timeline/controllers/element-interaction-controller";
import {
	TIMELINE_FINE_DRAG_RATIO,
	TIMELINE_TRACK_SWITCH_THRESHOLD_PX,
} from "@/timeline/components/interaction";
import { BASE_TIMELINE_PIXELS_PER_SECOND } from "@/timeline/scale";
import { mediaTime, TICKS_PER_SECOND } from "@/wasm";

const FPS = { numerator: 30, denominator: 1 };
const TICKS_PER_FRAME = TICKS_PER_SECOND / FPS.numerator;

describe("keepsSourceTrack", () => {
	test("위아래로 조금 흔들리면 원래 트랙에 둔다", () => {
		expect(
			keepsSourceTrack({
				startMouseY: 100,
				currentMouseY: 100 + TIMELINE_TRACK_SWITCH_THRESHOLD_PX - 1,
			}),
		).toBe(true);
		expect(keepsSourceTrack({ startMouseY: 100, currentMouseY: 100 - 3 })).toBe(true);
	});

	test("문턱을 넘으면 마우스가 있는 트랙을 따른다", () => {
		expect(
			keepsSourceTrack({
				startMouseY: 100,
				currentMouseY: 100 + TIMELINE_TRACK_SWITCH_THRESHOLD_PX,
			}),
		).toBe(false);
	});
});

describe("fineDragTime", () => {
	// 줌 1에서 1초만큼 마우스를 움직이면 클립은 그 비율만큼만 움직인다
	const oneSecondPx = BASE_TIMELINE_PIXELS_PER_SECOND;
	const fine = { mouseX: 500, time: mediaTime({ ticks: TICKS_PER_SECOND }) };

	test("마우스가 움직인 거리의 일부만큼, 프레임에 맞춰 옮긴다", () => {
		const time = fineDragTime({ fine, clientX: 500 + oneSecondPx, zoomLevel: 1, fps: FPS });
		expect(time - fine.time).toBeCloseTo(TICKS_PER_SECOND * TIMELINE_FINE_DRAG_RATIO, -2);
		expect(time % TICKS_PER_FRAME).toBe(0);
	});

	test("0초보다 앞으로는 가지 않는다", () => {
		expect(
			Number(fineDragTime({ fine, clientX: 500 - oneSecondPx * 100, zoomLevel: 1, fps: FPS })),
		).toBe(0);
	});
});
