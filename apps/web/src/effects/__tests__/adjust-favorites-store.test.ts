import { beforeEach, describe, expect, test } from "bun:test";

// bun에는 window.localStorage가 없다. 스토어가 만들어질 때만 메모리 저장소를 잠깐 깔아 둔다
const stored = new Map<string, string>();
Object.assign(globalThis, {
	window: {
		localStorage: {
			getItem: (key: string) => stored.get(key) ?? null,
			setItem: (key: string, value: string) => stored.set(key, value),
			removeItem: (key: string) => stored.delete(key),
		},
	},
});
const { useAdjustFavorites } = await import("../adjust-favorites-store");
Reflect.deleteProperty(globalThis, "window");

describe("useAdjustFavorites", () => {
	beforeEach(() => useAdjustFavorites.setState({ favorites: [] }));

	test("하트를 누르면 순서대로 쌓이고 다시 누르면 빠진다", () => {
		const { toggle } = useAdjustFavorites.getState();
		toggle({ presetId: "food" });
		toggle({ presetId: "noir" });
		expect(useAdjustFavorites.getState().favorites).toEqual(["food", "noir"]);

		toggle({ presetId: "food" });
		expect(useAdjustFavorites.getState().favorites).toEqual(["noir"]);
	});
});
