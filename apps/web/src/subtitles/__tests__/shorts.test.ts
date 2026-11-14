import { describe, expect, test } from "bun:test";
import { formatShorts, proposeShorts } from "../shorts";

/** 문장 하나가 자막 하나, 각 `seconds`초 */
const cues = ({ texts, seconds = 5 }: { texts: string[]; seconds?: number }) => texts.map((text, i) => ({ text, start: i * seconds, end: (i + 1) * seconds }));

describe("proposeShorts", () => {
	test("반전 말로 시작하는 20~55초 구간을 고르고, 문장 끝에서 끝낸다", () => {
		const texts = ["등뼈를 데쳐 줍니다.", "물을 붓습니다.", "그런데 여기서 끝이 아닙니다.", "양념장을 갈아요.", "고추씨를 넣어요.", "맵기를 20% 올려요.", "불을 끕니다.", "그릇에 담아요.", "밥을 말아요.", "다 먹었어요.", "설거지해요.", "끝입니다."];
		const [first] = proposeShorts({ cues: cues({ texts }) });
		expect(first.start).toBe(10);
		expect(first.end - first.start).toBeGreaterThanOrEqual(20);
		expect(first.end - first.start).toBeLessThanOrEqual(55);
		expect(first.text.startsWith("그런데 여기서 끝이 아닙니다.")).toBe(true);
	});

	test("앞 이야기를 받는 말로 시작하지 않고, 받는 말 뒤에 반전 말이 오면 시작할 수 있다", () => {
		const plain = proposeShorts({ cues: cues({ texts: ["그래서 물을 부어요.", "불을 켜요.", "끓여요.", "담아요.", "먹어요.", "끝이에요."] }) });
		expect(plain.every((s) => !s.text.startsWith("그래서"))).toBe(true);
		const hook = proposeShorts({ cues: cues({ texts: ["그리고 오늘의 킥이 있습니다.", "하몽이에요.", "감칠맛이 나요.", "우려내요.", "끝이에요."] }) });
		expect(hook[0].text.startsWith("그리고 오늘의 킥")).toBe(true);
	});

	test("문장 중간에서 끊긴 자막을 문장으로 다시 묶고 시간은 글자 수로 나눈다", () => {
		const [short] = proposeShorts({
			cues: [
				{ text: "앞 이야기. 그런데 말입니다", start: 0, end: 10 },
				{ text: "저는 못 먹어 봤어요. 남편이", start: 10, end: 20 },
				{ text: "만들어 준대요.", start: 20, end: 30 },
			],
		});
		expect(short.text).toBe("그런데 말입니다 저는 못 먹어 봤어요. 남편이 만들어 준대요.");
		expect(short.start).toBeCloseTo((10 * 6) / 15);
		expect(short.end).toBe(30);
	});

	test("겹치지 않게 고르고 시간 순으로 적는다", () => {
		const shorts = proposeShorts({ cues: cues({ texts: Array.from({ length: 60 }, (_, i) => (i % 10 === 0 ? `그런데 ${i}번 비결?` : `${i}번 문장.`)) }) });
		expect(shorts.length).toBe(5);
		shorts.slice(1).forEach((s, i) => expect(s.start).toBeGreaterThanOrEqual(shorts[i].end));
		expect(formatShorts({ shorts: shorts.slice(0, 1) })).toMatch(/^0:00-0:\d\d\n그런데 0번 비결\?/);
	});
});

describe("proposeShorts 문장 나누기", () => {
	test("숫자 사이 점(1.5큰술)에서는 문장을 끊지 않는다", () => {
		const texts = ["근데 비결은 간장 1.5큰술이에요.", "물은 2.5리터예요.", "불을 켜요.", "끓여요.", "담아요."];
		const [first] = proposeShorts({ cues: cues({ texts }) });
		expect(first.text).toContain("1.5큰술");
		expect(first.text).not.toContain("1. 5");
	});

	test("문장부호가 없는 자막은 자막 하나를 문장 하나로 본다", () => {
		const texts = Array.from({ length: 30 }, (_, i) => (i % 8 === 0 ? `근데 비결은 이거 ${i}` : `재료를 볶아요 ${i}`));
		expect(proposeShorts({ cues: cues({ texts, seconds: 3 }) }).length).toBeGreaterThan(0);
	});
});
