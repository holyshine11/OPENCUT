import { describe, expect, test } from "bun:test";
import { resolveTextShadow } from "../shadow";

describe("resolveTextShadow", () => {
	test("켜져 있으면 색과 투명도를 rgba로 합치고 거리·흐림은 그대로 둔다", () => {
		expect(
			resolveTextShadow({
				params: {
					"shadow.enabled": true,
					"shadow.color": "#ff8000",
					"shadow.opacity": 50,
					"shadow.blur": 12,
					"shadow.offsetX": 3,
					"shadow.offsetY": -4,
				},
			}),
		).toEqual({ color: "rgba(255, 128, 0, 0.5)", blur: 12, offsetX: 3, offsetY: -4 });
	});

	test("꺼져 있으면 그리지 않는다", () => {
		expect(resolveTextShadow({ params: { "shadow.enabled": false } })).toBeNull();
	});
});
