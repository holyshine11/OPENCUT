import { beforeEach, describe, expect, test } from "bun:test";

const root = { dataset: {} as Record<string, string> };
(globalThis as { document?: unknown }).document = { documentElement: root };

const { cancelSpace, isSpaceHeld, pressSpace, releaseSpace, setPanning } =
	await import("@/timeline/space-pan");

describe("space-pan", () => {
	beforeEach(() => cancelSpace());

	test("끌지 않고 떼면 재생", () => {
		pressSpace();
		expect(isSpaceHeld()).toBe(true);
		expect(releaseSpace()).toBe(true);
		expect(root.dataset.spacePan).toBeUndefined();
	});

	test("끌었으면 떼도 재생하지 않음", () => {
		pressSpace();
		setPanning(true);
		expect(root.dataset.spacePan).toBe("active");
		setPanning(false);
		expect(root.dataset.spacePan).toBe("ready");
		expect(releaseSpace()).toBe(false);
	});

	test("키 반복 입력은 끌기 기록을 지우지 않음", () => {
		pressSpace();
		setPanning(true);
		pressSpace();
		expect(releaseSpace()).toBe(false);
	});

	test("누르지 않은 상태의 keyup은 무시", () => {
		expect(releaseSpace()).toBe(false);
	});
});
