import { describe, expect, test } from "bun:test";
import { freshHooks } from "../style";

describe("freshHooks", () => {
	test("최근 훅과 같은 틀의 변주는 뺀다", () => {
		const hooks = freshHooks(["감히 어묵탕에 소주를 넣었습니다?", "남편이 또 사고를 칩니다", "파절이에 이거\n넣어 보신 분?"]);
		expect(hooks.some((hook) => hook.startsWith("도발형"))).toBe(false);
		expect(hooks.some((hook) => hook.startsWith("고발형"))).toBe(false);
		expect(hooks.some((hook) => hook.startsWith("질문형"))).toBe(false);
		expect(hooks.some((hook) => hook.startsWith("숫자형"))).toBe(true);
	});

	test("최근 훅이 없으면 전부 돌려준다", () => {
		expect(freshHooks([]).length).toBe(6);
	});
});
