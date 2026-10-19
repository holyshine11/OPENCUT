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
const { useFontFavorites } = await import("../favorites-store");
Reflect.deleteProperty(globalThis, "window");

describe("useFontFavorites", () => {
	beforeEach(() => useFontFavorites.setState({ favorites: [] }));

	test("누르면 추가되고 다시 누르면 빠진다", () => {
		const { toggle } = useFontFavorites.getState();
		toggle({ family: "Roboto", isLocal: false });
		toggle({ family: "AppleGothic", isLocal: true });
		expect(useFontFavorites.getState().favorites).toEqual([
			{ family: "Roboto", isLocal: false },
			{ family: "AppleGothic", isLocal: true },
		]);

		toggle({ family: "Roboto", isLocal: false });
		expect(useFontFavorites.getState().favorites).toEqual([
			{ family: "AppleGothic", isLocal: true },
		]);
	});

	test("font-favorites 키에 글꼴 이름과 설치 여부를 저장한다", () => {
		useFontFavorites.getState().toggle({ family: "Roboto", isLocal: false });
		expect(JSON.parse(stored.get("font-favorites") ?? "{}").state).toEqual({
			favorites: [{ family: "Roboto", isLocal: false }],
		});
	});
});
