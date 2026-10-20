import { describe, expect, test } from "bun:test";
import type { TimelineElement } from "@/timeline";
import { findDuplicateOffset } from "@/timeline/placement/overlap";

const clip = (id: string, startTime: number, duration: number) =>
	({ id, startTime, duration }) as unknown as TimelineElement;

describe("findDuplicateOffset", () => {
	test("뒤가 비어 있으면 바로 뒤에 붙인다", () => {
		const a = clip("a", 100, 50);
		expect(findDuplicateOffset({ trackElements: [a], originals: [a] })).toBe(50);
	});

	test("바로 뒤가 막혀 있으면 들어갈 수 있는 첫 빈자리로 민다", () => {
		const a = clip("a", 0, 50);
		const b = clip("b", 60, 30); // 50~60 사이는 10뿐이라 못 들어간다
		const c = clip("c", 150, 10); // 90~150 은 들어간다
		expect(
			findDuplicateOffset({ trackElements: [a, b, c], originals: [a] }),
		).toBe(90);
	});

	test("여러 클립은 간격을 유지한 채 묶음 끝 뒤로 간다", () => {
		const a = clip("a", 0, 10);
		const b = clip("b", 20, 10);
		expect(
			findDuplicateOffset({ trackElements: [a, b], originals: [a, b] }),
		).toBe(30);
	});
});
