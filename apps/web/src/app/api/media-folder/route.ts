// 미디어 파일은 브라우저 저장소(OPFS)에 있어 Finder에서 보이지 않는다. 폴더 버튼을 누르면
// 파일을 MEDIA_FOLDER/<프로젝트>/<종류>에 복사하고(PUT) Finder로 연다(POST)
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, parse } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { NextRequest } from "next/server";

const UNCONFIGURED_MESSAGE =
	"미디어 폴더(MEDIA_FOLDER)가 설정되지 않았습니다. apps/web/.env.local에 MEDIA_FOLDER를 넣으세요.";

/** 경로를 벗어나지 못하게 한 칸짜리 이름만 받는다 */
function safeSegment(value: string | null): string | null {
	const segment = value?.replace(/[/\\:\0]/g, "_").trim();
	return segment && segment !== "." && segment !== ".." ? segment : null;
}

function resolveFolder(request: NextRequest): string | Response {
	// 다른 사이트가 이 주소로 요청을 보내 파일을 쓰거나 Finder를 열지 못하게 한다
	if (request.headers.get("sec-fetch-site") !== "same-origin") {
		return Response.json(
			{ error: "허용되지 않은 요청입니다." },
			{ status: 403 },
		);
	}
	const root = process.env.MEDIA_FOLDER?.replace(/^~(?=\/|$)/, homedir());
	if (!root)
		return Response.json({ error: UNCONFIGURED_MESSAGE }, { status: 503 });

	const params = request.nextUrl.searchParams;
	const project = safeSegment(params.get("project"));
	const kind = safeSegment(params.get("kind"));
	if (!project || !kind) {
		return Response.json({ error: "잘못된 폴더 이름입니다." }, { status: 400 });
	}
	return join(root, project, kind);
}

/** 이미 복사한 파일(같은 이름·크기)이 있으면 null, 없으면 쓸 경로. 이름만 같은 다른 파일은 "이름 (2)"로 둔다 */
async function findTarget({
	folder,
	name,
	size,
}: {
	folder: string;
	name: string;
	size: number;
}): Promise<string | null> {
	const { name: base, ext } = parse(name);
	let target = join(folder, name);
	for (let copy = 2; ; copy++) {
		const existing = await stat(target).catch(() => null);
		if (!existing) return target;
		if (existing.size === size) return null;
		target = join(folder, `${base} (${copy})${ext}`);
	}
}

// 올리기 전에 이미 있는지 묻는다. PUT이 본문을 다 받기 전에 204로 답하면 브라우저는 연결이 끊긴 것으로 본다
export async function HEAD(request: NextRequest) {
	const folder = resolveFolder(request);
	if (folder instanceof Response) return new Response(null, { status: folder.status });
	const params = request.nextUrl.searchParams;
	const name = safeSegment(params.get("name"));
	const size = Number(params.get("size"));
	if (!name || !Number.isFinite(size)) return new Response(null, { status: 400 });
	const target = await findTarget({ folder, name, size });
	return new Response(null, { status: target ? 404 : 204 });
}

export async function PUT(request: NextRequest) {
	const folder = resolveFolder(request);
	if (folder instanceof Response) return folder;
	const name = safeSegment(request.nextUrl.searchParams.get("name"));
	if (!name || !request.body) {
		return Response.json({ error: "잘못된 파일입니다." }, { status: 400 });
	}

	const size = Number(request.headers.get("content-length"));
	const target = await findTarget({ folder, name, size });
	if (!target) return new Response(null, { status: 204 });

	await mkdir(folder, { recursive: true });
	// 끝까지 받은 뒤에 이름을 바꿔서 반쯤 쓴 파일이 남지 않게 한다
	const partial = `${target}.part`;
	await pipeline(
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- DOM과 Node의 ReadableStream 타입이 다를 뿐 같은 객체다
		Readable.fromWeb(request.body as unknown as NodeReadableStream),
		createWriteStream(partial),
	);
	await rename(partial, target);
	return new Response(null, { status: 201 });
}

export async function POST(request: NextRequest) {
	const folder = resolveFolder(request);
	if (folder instanceof Response) return folder;
	await mkdir(folder, { recursive: true });
	await new Promise<void>((resolve, reject) =>
		execFile("open", [folder], (error) => (error ? reject(error) : resolve())),
	);
	return Response.json({ folder });
}
