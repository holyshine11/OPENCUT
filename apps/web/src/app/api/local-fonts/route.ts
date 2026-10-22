// 브라우저는 설치된 글꼴을 마음대로 쓰지 못한다(Safari는 목록 API도 없고 사용자 글꼴도 막는다).
// 서버가 같은 맥에서 돌므로 macOS 글꼴 목록을 대신 읽고(GET), 글꼴 파일을 내준다(GET ?file=)
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { promisify } from "node:util";
import type { NextRequest } from "next/server";

// 가족 이름, 스타일 이름, 파일 경로를 한 줄씩 [family, style, path]로 뽑는다
const LIST_FONTS_SCRIPT = `
ObjC.import("AppKit");
var manager = $.NSFontManager.sharedFontManager, rows = [];
manager.availableFontFamilies.js.forEach(function (family) {
	var members = manager.availableMembersOfFontFamily(family.js);
	if (members.isNil()) return;
	members.js.forEach(function (member) {
		var info = member.js;
		var font = $.NSFont.fontWithNameSize(info[0].js, 12);
		var url = font.isNil() ? null : font.fontDescriptor.objectForKey("NSCTFontFileURLAttribute");
		rows.push([family.js, info[1].js, !url || url.isNil() ? null : url.path.js]);
	});
});
JSON.stringify(rows);
`;

// CSS font-weight 표준 이름표. 더 긴 이름(ExtraBold)을 먼저 본다
const STYLE_WEIGHTS: Array<[RegExp, number]> = [
	[/thin|hairline/i, 100],
	[/(extra|ultra)\s*light/i, 200],
	[/light/i, 300],
	[/medium/i, 500],
	[/(semi|demi)\s*bold/i, 600],
	[/(extra|ultra)\s*bold/i, 800],
	[/black|heavy/i, 900],
	[/bold/i, 700],
];
const REGULAR_WEIGHT = 400;

const FONT_TYPES: Record<string, string> = {
	".ttf": "font/ttf",
	".otf": "font/otf",
};

interface LocalFontFace {
	file: string;
	weight: number;
	italic: boolean;
}

let servableFiles = new Set<string>();

function weightOf(style: string): number {
	return (
		STYLE_WEIGHTS.find(([pattern]) => pattern.test(style))?.[1] ??
		REGULAR_WEIGHT
	);
}

/** 가족 이름 → 내려줄 수 있는 글꼴 파일. 시스템 글꼴과 .ttc 묶음은 브라우저가 이름으로 바로 쓰므로 파일 없이 둔다 */
async function scanFonts(): Promise<Record<string, LocalFontFace[]>> {
	const { stdout } = await promisify(execFile)(
		"osascript",
		["-l", "JavaScript", "-e", LIST_FONTS_SCRIPT],
		{ maxBuffer: 64 * 1024 * 1024 },
	);
	const rows: Array<[string, string, string | null]> = JSON.parse(stdout);
	const catalog: Record<string, LocalFontFace[]> = {};
	const files = new Set<string>();
	for (const [family, style, file] of rows) {
		const faces = (catalog[family] ??= []);
		if (
			!file ||
			file.startsWith("/System/") ||
			!FONT_TYPES[extname(file).toLowerCase()]
		)
			continue;
		const face = {
			file,
			weight: weightOf(style),
			italic: /italic|oblique/i.test(style),
		};
		if (
			faces.some(
				(other) => other.weight === face.weight && other.italic === face.italic,
			)
		)
			continue;
		faces.push(face);
		files.add(file);
	}
	servableFiles = files;
	return catalog;
}

export async function GET(request: NextRequest) {
	// 다른 사이트가 이 주소로 글꼴 파일을 읽어 가지 못하게 한다
	if (request.headers.get("sec-fetch-site") !== "same-origin") {
		return Response.json(
			{ error: "허용되지 않은 요청입니다." },
			{ status: 403 },
		);
	}
	if (process.platform !== "darwin") {
		return Response.json({ error: "macOS에서만 지원합니다." }, { status: 501 });
	}

	const file = request.nextUrl.searchParams.get("file");
	if (!file) return Response.json(await scanFonts());

	if (!servableFiles.has(file)) await scanFonts();
	if (!servableFiles.has(file)) {
		return Response.json({ error: "설치된 글꼴이 아닙니다." }, { status: 404 });
	}
	return new Response(new Uint8Array(await readFile(file)), {
		headers: {
			"Content-Type": FONT_TYPES[extname(file).toLowerCase()],
			"Cache-Control": "private, max-age=3600",
		},
	});
}
