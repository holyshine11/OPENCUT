import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { join } from "node:path";
import { en } from "../messages/en";

// UI 문구는 i18n/messages에 둔다. 이 검사는 .tsx에 남은 영어 문구(JSX 텍스트와
// aria-label·title·placeholder·alt 값)를 찾는다. 번역하지 않는 게 맞는 문구만 아래에 사유와 함께 둔다.
const ALLOWED = new Set([
	// 브랜드·서비스 이름
	"components/editor/editor-header.tsx: Discord",
	"components/icons/brand.tsx: Vercel",
	"components/icons/brand.tsx: Marble",
	"components/icons/brand.tsx: Data Buddy",
	// 색 형식 표기
	"components/ui/color-picker.tsx: HEX",
	"components/ui/color-picker.tsx: RGB",
	"components/ui/color-picker.tsx: HSL",
	"components/ui/color-picker.tsx: HSV",
	// 사용자가 그대로 입력해야 하는 확인 단어
	'project/components/delete-project-dialog.tsx: placeholder="DELETE"',
	// 글꼴 미리보기 견본 글자
	"text/components/style-presets-section.tsx: Aa",
	// aria-hidden 안이라 읽히지 않는 문구, 쓰이지 않는 컴포넌트
	"components/ui/breadcrumb.tsx: More",
	'components/ui/breadcrumb.tsx: aria-label="breadcrumb"',
	"components/ui/sheet.tsx: Close",
	// 툴바에서 빠져 화면에 나오지 않는 가이드 기능
	"preview/components/guide-popover.tsx: Guides",
	"guides/definitions/custom.tsx: Add guide line",
	"guides/definitions/tiktok-layout.tsx: TikTok Layout",
]);

const SRC = join(import.meta.dir, "..", "..");
const ATTRIBUTE =
	/\b(aria-label|title|placeholder|alt)="([^"]*[A-Za-z]{2,}[^"]*)"/g;
const TEXT_BETWEEN_TAGS = />\s*([A-Za-z][A-Za-z0-9 ,.'!?-]*[A-Za-z.!?])\s*</g;
const TEXT_ONLY_LINE = /^\s*([A-Z][A-Za-z0-9 ,.'!?-]*[A-Za-z.!?])\s*$/;

async function findEnglishStrings(): Promise<string[]> {
	const found: string[] = [];
	for await (const file of new Glob("**/*.tsx").scan(SRC)) {
		if (file.includes("__tests__")) continue;
		const lines = (await Bun.file(join(SRC, file)).text()).split(/\r?\n/);
		for (const [index, line] of lines.entries()) {
			const trimmed = line.trim();
			if (/^(\/\/|\*|\/\*|\{\/\*)/.test(trimmed)) continue;
			const hits = [
				...[...line.matchAll(ATTRIBUTE)].map((match) => match[0]),
				...[...line.matchAll(TEXT_BETWEEN_TAGS)].map((match) => match[1]),
			];
			// 여러 줄로 나뉜 JSX 텍스트: 앞줄이 태그로 끝나는 영어 문장 한 줄
			if (
				TEXT_ONLY_LINE.test(line) &&
				(lines[index - 1] ?? "").trimEnd().endsWith(">")
			) {
				hits.push(trimmed);
			}
			for (const hit of hits) found.push(`${file}: ${hit}`);
		}
	}
	return found.filter((entry) => !ALLOWED.has(entry));
}

describe("UI strings", () => {
	test(".tsx에 번역되지 않은 영어 문구가 없다", async () => {
		expect(await findEnglishStrings()).toEqual([]);
	});
});

// .ts의 레지스트리·기본값 이름은 translateLabel로 영어 원문을 키 삼아 번역한다.
// 원문을 고치거나 새로 넣고 labels에 빠뜨리면 화면에 영어가 그대로 나오므로 여기서 잡는다.
// 저장소 키(persist name)나 성능 측정 이름처럼 소문자로 시작하는 값과 숫자 칸의 한 글자 표기(X, W)는
// 화면 문구가 아니라서 보지 않는다
const LABEL_ALLOWED = new Set([
	// 브랜드
	"site/brand.ts: OpenCut",
	// 코드 안에서만 쓰는 언어 이름. 화면에는 m.language를 쓴다
	"transcription/languages.ts: Korean",
	"transcription/languages.ts: English",
	// 화면에는 섹션 id로 m.stickers.recentlyUsed를 쓴다
	"stickers/index.ts: Recently used",
]);
const LABEL_FIELD = /\b(?:label|name|title|shortLabel)\s*:\s*"([A-Z][^"]+)"/g;

async function findUntranslatedLabels(): Promise<string[]> {
	const labels: Record<string, string> = en.labels;
	const found: string[] = [];
	for await (const file of new Glob("**/*.ts").scan(SRC)) {
		if (file.includes("__tests__") || file.startsWith("i18n/")) continue;
		const text = await Bun.file(join(SRC, file)).text();
		for (const match of text.matchAll(LABEL_FIELD)) {
			const entry = `${file}: ${match[1]}`;
			if (!(match[1] in labels) && !LABEL_ALLOWED.has(entry)) found.push(entry);
		}
	}
	return found;
}

describe("labels", () => {
	test(".ts의 화면 이름은 모두 i18n labels에 번역이 있다", async () => {
		expect(await findUntranslatedLabels()).toEqual([]);
	});
});
