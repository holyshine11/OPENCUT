import { describe, expect, test } from "bun:test";
import { buildPrompt, buildRevisePrompt, buildShortsPrompt, freshHooks } from "../style";

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

describe("buildRevisePrompt", () => {
	test("본 클립과 새 클립을 구분하고 효과음 이름은 붙여 쓴(NFC) 글자로 보낸다", () => {
		const clip = (id: string) => ({ id, name: `${id}.mp4`, duration: 10, times: [0, 3], sheetFile: `${id}.jpg` });
		const sound = "띠용.mp3".normalize("NFD");
		const build = ({ scope, recipe = "쯔유 3큰술" }: { scope: "all" | "sfx" | "captions" | "bgm"; recipe?: string }) =>
			buildRevisePrompt({
			scope,
			recipe,
			clips: [clip("c01"), clip("c02"), clip("c03")],
			canvas: { width: 1920, height: 1080 },
			hasVoice: true,
			hasHusbandVoice: false,
			sounds: [sound, "처음 보는 소리.mp3"],
			bgms: ["재즈 - 곡.mp3"],
			plan: {
				concept: "",
				hook: "",
				look: null,
				bgm: null,
				beats: [
					{
						clip: "c01", start: 0, end: 3, narration: "", voice: "wife", caption: "",
						transition: null, sfx: sound, sfxOn: "근데", impact: null, mosaic: [],
					},
				],
				youtube: { title: "", description: "", tags: [] },
				review: [],
			},
			timing: [],
			seen: ["c01", "c02"],
		});
		const prompt = build({ scope: "all" });
		expect(prompt).toContain("c01.jpg (프레임 시각: 0.0, 3.0초) [쓴 구간: 0.0~3.0]");
		expect(prompt).toContain("c02.jpg (프레임 시각: 0.0, 3.0초) [지난번에 보고 안 쓴 클립]");
		expect(prompt).toContain("c03.jpg (프레임 시각: 0.0, 3.0초) [새 클립]");
		expect(prompt).toContain('효과음: 띠용.mp3("근데"에)');
		expect(prompt).toContain("# BGM 목록\n재즈 - 곡.mp3");
		expect(prompt).not.toContain(sound);
		expect(prompt).toContain("[1/5]");

		// 범위를 고르면 촬영본과, 그 범위에 필요 없는 효과음 목록은 보내지 않는다
		const sfx = build({ scope: "sfx" });
		// 채널에서 쓰던 소리는 쓰임새와 함께 앞에, 나머지는 이름만 뒤에 온다
		expect(sfx).toContain("## 주로 쓰는 소리(10번 중 8번은 여기서 고른다)\n- 띠용.mp3 — 반전");
		expect(sfx).toContain("위에 맞는 게 없을 때만)\n처음 보는 소리.mp3");
		expect(sfx).not.toContain("# 촬영 원본");
		expect(sfx).not.toContain("# BGM 목록");
		expect(sfx).toContain("set에 적을 수 있는 항목은 sfx, sfxOn뿐");
		// BGM만 고칠 때는 곡 목록만 보내고 컷 수정은 받지 않는다
		const bgm = build({ scope: "bgm" });
		expect(bgm).toContain("- BGM: 없음");
		expect(bgm).toContain("# BGM 목록\n재즈 - 곡.mp3");
		expect(bgm).not.toContain("# 효과음 목록");
		expect(bgm).not.toContain('"changes"');
		const captions = build({ scope: "captions" });
		expect(captions).not.toContain("# 효과음 목록");
		expect(captions).not.toContain("# 촬영 원본");
		expect(captions).not.toContain('"add"');

		// 레시피 메모는 말을 쓰는 범위에만 보내고, 비어 있으면 절을 만들지 않는다
		expect(prompt).toContain("# 레시피 메모\n");
		expect(prompt).toContain("쯔유 3큰술");
		expect(captions).toContain("# 레시피 메모\n");
		expect(sfx).not.toContain("# 레시피 메모");
		expect(bgm).not.toContain("# 레시피 메모");
		expect(build({ scope: "all", recipe: "  " })).not.toContain("# 레시피 메모");
	});
});

describe("buildPrompt", () => {
	test("내레이션 배속과 레시피 전달 규칙, 레시피 메모를 넣는다", () => {
		const build = (recipe: string) =>
			buildPrompt({
				clips: [{ id: "c01", name: "c01.mp4", duration: 10, times: [0, 3], sheetFile: "c01.jpg" }],
				canvas: { width: 1080, height: 1920 },
				hasVoice: true,
				hasHusbandVoice: false,
				sounds: [],
				bgms: [],
				recent: [],
				recipe,
			});
		const prompt = build("물 1.5L, 중불 15분");
		expect(prompt).toContain("1.2배속");
		expect(prompt).toContain("× 5)자");
		expect(prompt).toContain("## 레시피 전달");
		expect(prompt).toContain("# 레시피 메모\n사용자가 적어 준 실제 레시피다.");
		expect(prompt).toContain("물 1.5L, 중불 15분\n\n# 촬영 원본");
		expect(build("")).not.toContain("# 레시피 메모");
	});

	// 쇼츠에 기획의 레시피·드립을 전부 담으라 하면 맞출 수 없어 출력 한도까지 생각만 한다
	test("쇼츠는 기획을 다 담으라 하지 않고 핵심만 고르게 한다", () => {
		const build = (canvas: { width: number; height: number }) =>
			buildPrompt({
				clips: [{ id: "c01", name: "c01.mp4", duration: 10, times: [0, 3], sheetFile: "c01.jpg" }],
				canvas,
				hasVoice: true,
				hasHusbandVoice: false,
				sounds: [],
				bgms: [],
				recent: [],
				recipe: "",
				brief: "제목: 어묵탕",
			});
		const short = build({ width: 1080, height: 1920 });
		expect(short).not.toContain("빠짐없이 나눠");
		expect(short).not.toContain("웃음 포인트를 전부");
		expect(short).toContain("youtube.description에 쓴다");
		const long = build({ width: 1920, height: 1080 });
		expect(long).toContain("빠짐없이 나눠");
		expect(long).toContain("웃음 포인트를 전부");
		// 확정된 기획과 겹치는 무작위 훅·엔딩을 시키지 않고, 기획의 긴 문장은 줄이게 한다
		expect(short).toContain("훅: 확정된 기획의 진행 방식대로");
		expect(short).toContain("엔딩: 확정된 기획의 진행 방식대로");
		expect(short).toContain("내레이션 길이 규칙은 기획보다 먼저다");
	});
});

describe("buildShortsPrompt", () => {
	test("롱폼 컷 목록만 보내고 촬영본 스틸·검색은 쓰지 않게 한다", () => {
		const prompt = buildShortsPrompt({
			long: [
				{ clip: "c08", start: 63.4, end: 68, narration: "어묵은 물결로 접어 꼬치 6개", voice: "wife", caption: "어묵 꼬치 6개", mosaic: [] },
				{ clip: "c12", start: 2, end: 5, narration: "", voice: "husband", caption: "", mosaic: [] },
			],
			canvas: { width: 1080, height: 1920 },
			hasVoice: true,
			hasHusbandVoice: true,
			sounds: [],
			bgms: [],
			recipe: "물 1.5L",
		});
		expect(prompt).toContain('1. c08 63.4~68.0초 | 내레이션: "어묵은 물결로 접어 꼬치 6개" | 자막: "어묵 꼬치 6개"');
		expect(prompt).toContain("2. c12 2.0~5.0초 | 내레이션(남편): (원음) | 자막: (없음)");
		expect(prompt).toContain("# 레시피 메모");
		expect(prompt).toContain("스킬과 검색은 쓰지 않는다");
		expect(prompt).not.toContain("Read로 전부 열어 본다");
		expect(prompt).toContain('"beats": [');
	});
});
