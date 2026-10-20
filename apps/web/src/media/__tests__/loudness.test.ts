import { describe, expect, test } from "bun:test";
import {
	averageLufs,
	integratedLufs,
	meanSquareTail,
	powerToLufs,
} from "../loudness";

const lufsToPower = (lufs: number) => 10 ** ((lufs + 0.691) / 10);

describe("loudness", () => {
	test("파워 ↔ LUFS 왕복, 무음은 -∞", () => {
		expect(powerToLufs(lufsToPower(-14))).toBeCloseTo(-14);
		expect(powerToLufs(0)).toBe(Number.NEGATIVE_INFINITY);
	});

	test("끝 count개만 평균 제곱", () => {
		const samples = new Float32Array([1, 1, 0.5, 0.5]);
		expect(meanSquareTail({ samples, count: 2 })).toBeCloseTo(0.25);
	});

	test("통합 라우드니스는 절대(-70)·상대(-10 LU) 게이트로 조용한 블록을 뺀다", () => {
		const loud = Array(10).fill(lufsToPower(-20));
		const quiet = Array(10).fill(lufsToPower(-40)); // 상대 게이트 아래
		const silence = Array(10).fill(lufsToPower(-80)); // 절대 게이트 아래
		expect(integratedLufs([...loud, ...quiet, ...silence])).toBeCloseTo(-20, 1);
		expect(averageLufs([...loud, ...quiet])).toBeLessThan(-20);
		expect(integratedLufs(silence)).toBe(Number.NEGATIVE_INFINITY);
	});
});
