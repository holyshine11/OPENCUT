import { describe, expect, test } from "bun:test";
import { buildCaptionChunks } from "../caption";
import { parseTerms } from "../terms-store";
import { captionFormOf } from "../caption-layout-store";

const SHORT = {
	maxCharsPerLine: 14,
	maxLines: 1,
	minDuration: 0.6,
	maxDuration: 3,
	stripPunctuation: true,
};

const LONG = {
	maxCharsPerLine: 22,
	maxLines: 2,
	minDuration: 1,
	maxDuration: 6,
	stripPunctuation: false,
};

function timedWords(texts: string[], { step = 0.4 } = {}) {
	return texts.map((text, index) => ({
		text,
		start: index * step,
		end: index * step + step,
	}));
}

function segmentOf(words: { text: string; start: number; end: number }[]) {
	return {
		text: words.map((word) => word.text).join(" "),
		start: words[0].start,
		end: words[words.length - 1].end,
		words,
	};
}

describe("buildCaptionChunks", () => {
	test("숏폼은 띄어쓰기 포함 14자를 넘기지 않고 단어 중간에서 끊지 않는다", () => {
		const words = timedWords(["저는", "오늘", "국밥", "먹어요", "돼지국밥이요"]);
		const captions = buildCaptionChunks({
			segments: [segmentOf(words)],
			layout: SHORT,
		});
		expect(captions.map((caption) => caption.text)).toEqual([
			"저는 오늘 국밥 먹어요",
			"돼지국밥이요",
		]);
	});

	test("롱폼은 22자 두 줄까지 한 자막에 담고 줄바꿈으로 나눈다", () => {
		const words = timedWords(
			["오늘은", "제가", "자주", "가는", "국밥집", "사장님께", "비법을", "직접", "배워", "왔어요", "여러분", "꼭", "따라", "해보세요"],
			{ step: 0.3 },
		);
		const captions = buildCaptionChunks({
			segments: [segmentOf(words)],
			layout: LONG,
		});
		expect(captions.map((caption) => caption.text)).toEqual([
			// 21자 + 22자
			"오늘은 제가 자주 가는 국밥집 사장님께\n비법을 직접 배워 왔어요 여러분 꼭 따라",
			"해보세요",
		]);
	});

	test("최대 표시 시간을 넘기면 글자 수가 남아도 자막을 나눈다", () => {
		// 단어 하나가 1.2초. 숏폼 최대 3초라 세 번째 단어는 다음 자막으로 간다
		const words = timedWords(["아", "그", "럼", "요"], { step: 1.2 });
		const captions = buildCaptionChunks({
			segments: [segmentOf(words)],
			layout: SHORT,
		});
		expect(captions).toEqual([
			{ text: "아 그", startTime: 0, duration: 2.4 },
			{ text: "럼 요", startTime: 2.4, duration: 2.4 },
		]);
	});

	test("최소 표시 시간보다 짧으면 늘리고, 다음 자막은 그 뒤에서 시작한다", () => {
		const words = [
			{ text: "네", start: 1, end: 1.2 },
			{ text: "좋아요", start: 1.3, end: 1.8 },
		];
		const captions = buildCaptionChunks({
			segments: [
				{ ...segmentOf(words.slice(0, 1)) },
				{ ...segmentOf(words.slice(1)) },
			],
			layout: LONG,
		});
		expect(captions).toEqual([
			{ text: "네", startTime: 1, duration: 1 },
			{ text: "좋아요", startTime: 2, duration: 1 },
		]);
	});

	test("숏폼은 마침표·쉼표를 지우고 물음표는 남긴다. 문장이 끝나면 자막을 나눈다", () => {
		const words = timedWords(["네,", "맞아요.", "진짜요?", "그럼요"]);
		const captions = buildCaptionChunks({
			segments: [segmentOf(words)],
			layout: SHORT,
		});
		expect(captions.map((caption) => caption.text)).toEqual([
			"네 맞아요",
			"진짜요?",
			"그럼요",
		]);
	});

	test("롱폼은 문장부호를 그대로 둔다", () => {
		const words = timedWords(["네,", "맞아요.", "진짜요?"]);
		const captions = buildCaptionChunks({
			segments: [segmentOf(words)],
			layout: LONG,
		});
		expect(captions.map((caption) => caption.text)).toEqual([
			"네, 맞아요.",
			"진짜요?",
		]);
	});

	test("단어 시간 정보가 없으면 구간 시간을 글자 수 비율로 나눈다", () => {
		const captions = buildCaptionChunks({
			segments: [{ text: "가나다라마바사아 자차카타파하가나", start: 0, end: 4 }],
			layout: SHORT,
		});
		expect(captions).toEqual([
			{ text: "가나다라마바사아", startTime: 0, duration: 2 },
			{ text: "자차카타파하가나", startTime: 2, duration: 2 },
		]);
	});
});

describe("parseTerms", () => {
	test("쉼표와 줄바꿈으로 나누고 빈 값과 중복을 뺀다", () => {
		expect(parseTerms({ input: "옥동식, 석박지\n 옥동식 ,,\n영동감자탕" })).toEqual([
			"옥동식",
			"석박지",
			"영동감자탕",
		]);
	});
});

describe("captionFormOf", () => {
	test("세로 화면은 숏폼, 가로·정사각형은 롱폼", () => {
		expect(captionFormOf({ canvasSize: { width: 1080, height: 1920 } })).toBe("shortForm");
		expect(captionFormOf({ canvasSize: { width: 1920, height: 1080 } })).toBe("longForm");
		expect(captionFormOf({ canvasSize: { width: 1080, height: 1080 } })).toBe("longForm");
	});
});
