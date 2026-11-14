// AI 자동 편집은 이 컴퓨터에 설치된 Claude Code(claude 명령)를 불러서 한다. API 키가 아니라
// 사용자가 claude에 로그인해 둔 구독으로 돌기 때문에 로그인 확인·다시 로그인도 여기서 맡는다.
// GET: 로그인 상태, POST ?action=login: 터미널에서 다시 로그인, POST: 스틸 시트와 프롬프트를 받아 진행 상황을 한 줄씩(NDJSON) 흘려보낸다
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";
import { AI_EDIT_MODELS } from "@/ai-edit/models";
import { record } from "@/ai-edit/plan";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
// 앱을 Finder에서 켜면 PATH에 npm 전역 폴더가 없다
const ENV = {
	...process.env,
	PATH: `${process.env.PATH ?? ""}:${homedir()}/.npm-global/bin:${homedir()}/.local/bin:${homedir()}/.claude/local:/opt/homebrew/bin:/usr/local/bin`,
};
const NOT_INSTALLED = "Claude Code(claude 명령)를 찾지 못했습니다. 설치하거나 apps/web/.env.local에 CLAUDE_BIN을 넣으세요.";
const SHEET_NAME = /^c\d{2,3}\.jpg$/;

// 다른 사이트가 이 주소로 요청을 보내 사용자의 구독을 쓰지 못하게 한다
function forbidden(request: NextRequest): Response | null {
	return request.headers.get("sec-fetch-site") === "same-origin"
		? null
		: Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
}

function parseJson(text: string): Record<string, unknown> | null {
	try {
		const value: unknown = JSON.parse(text);
		return value && typeof value === "object" ? record(value) : null;
	} catch {
		return null;
	}
}

function authStatus(): Promise<Record<string, unknown> | null> {
	return new Promise((resolve) =>
		execFile(CLAUDE_BIN, ["auth", "status"], { env: ENV, timeout: 15_000 }, (_error, stdout) =>
			resolve(parseJson(stdout)),
		),
	);
}

export async function GET(request: NextRequest) {
	const denied = forbidden(request);
	if (denied) return denied;
	const status = await authStatus();
	if (!status) return Response.json({ error: NOT_INSTALLED }, { status: 503 });
	return Response.json({
		loggedIn: status.loggedIn === true,
		plan: typeof status.subscriptionType === "string" ? status.subscriptionType : null,
		expiresAt: typeof status.loginExpiresAt === "string" ? status.loginExpiresAt : null,
	});
}

function login(): Promise<Response> {
	// 로그인은 브라우저 창과 터미널 입력이 필요해서 터미널을 띄워 사용자가 직접 마치게 한다
	return new Promise((resolve) =>
		execFile(
			"osascript",
			["-e", 'tell application "Terminal" to do script "claude auth login"', "-e", 'tell application "Terminal" to activate'],
			{ env: ENV },
			(error) =>
				resolve(
					error
						? Response.json({ error: "터미널을 열지 못했습니다. 터미널에서 claude auth login을 실행하세요." }, { status: 500 })
						: new Response(null, { status: 204 }),
				),
		),
	);
}

interface RunBody {
	model: string;
	prompt: string;
	sheets: { name: string; dataUrl: string }[];
}

function parseBody(value: unknown): RunBody | null {
	const { model, prompt, sheets } = record(value);
	if (typeof prompt !== "string" || typeof model !== "string") return null;
	if (!AI_EDIT_MODELS.some((item) => item.id === model)) return null;
	if (!Array.isArray(sheets) || sheets.length === 0) return null;
	const files = sheets.flatMap((item) => {
		const { name, dataUrl } = record(item);
		return typeof name === "string" &&
			SHEET_NAME.test(name) &&
			typeof dataUrl === "string" &&
			dataUrl.startsWith("data:image/jpeg;base64,")
			? [{ name, dataUrl }]
			: [];
	});
	return files.length === sheets.length ? { model, prompt, sheets: files } : null;
}

/** 진행 화면에 보여 줄 한 줄. 도구를 쓰는 중이면 무엇을 하는지 적는다 */
function describe(block: Record<string, unknown>): string | null {
	if (block.type === "text" && typeof block.text === "string") return block.text.trim() || null;
	if (block.type !== "tool_use") return null;
	const input = record(block.input);
	if (block.name === "Read") return `촬영본 확인: ${String(input.file_path ?? "").split("/").pop()}`;
	if (block.name === "WebSearch") return `검색 추세 확인: ${String(input.query ?? "")}`;
	if (block.name === "Skill") return `스킬 사용: ${String(input.skill ?? "")}`;
	return null;
}

export async function POST(request: NextRequest) {
	const denied = forbidden(request);
	if (denied) return denied;
	if (request.nextUrl.searchParams.get("action") === "login") return login();

	const body = parseBody(await request.json().catch(() => null));
	if (!body) return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });

	const status = await authStatus();
	if (!status) return Response.json({ error: NOT_INSTALLED }, { status: 503 });
	if (status.loggedIn !== true) {
		return Response.json({ error: "Claude 로그인이 풀렸습니다. 설정 → AI에서 다시 연결하세요." }, { status: 401 });
	}

	const folder = await mkdtemp(join(tmpdir(), "opencut-ai-edit-"));
	for (const sheet of body.sheets) {
		await writeFile(join(folder, sheet.name), Buffer.from(sheet.dataUrl.slice(sheet.dataUrl.indexOf(",") + 1), "base64"));
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			const send = (event: Record<string, unknown>) => {
				if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			};
			const finish = () => {
				if (closed) return;
				closed = true;
				controller.close();
				void rm(folder, { recursive: true, force: true });
			};

			// 촬영본을 읽고 검색·스킬만 쓴다. 명령 실행이나 파일 쓰기는 허용하지 않는다
			const child = spawn(
				CLAUDE_BIN,
				[
					"-p",
					"--model", body.model,
					"--output-format", "stream-json",
					"--verbose",
					"--no-session-persistence",
					"--allowedTools", "Read", "Skill", "WebSearch",
					"--disallowedTools", "Bash", "Edit", "Write", "NotebookEdit", "Agent",
				],
				{ cwd: folder, env: ENV, stdio: ["pipe", "pipe", "pipe"] },
			);
			request.signal.addEventListener("abort", () => child.kill());
			child.stdin.end(body.prompt);

			let buffer = "";
			let stderr = "";
			let result: string | null = null;
			child.stdout.on("data", (chunk: Buffer) => {
				buffer += chunk.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					const message = parseJson(line);
					if (!message) continue;
					if (message.type === "assistant") {
						const { content } = record(message.message);
						for (const block of Array.isArray(content) ? content : []) {
							const text = describe(record(block));
							if (text) send({ type: "log", text });
						}
					} else if (message.type === "result") {
						if (message.is_error === true || typeof message.result !== "string") {
							send({ type: "error", message: String(message.result ?? message.subtype ?? "실패") });
						} else {
							result = message.result;
						}
					}
				}
			});
			child.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
			});
			child.on("error", () => {
				send({ type: "error", message: NOT_INSTALLED });
				finish();
			});
			child.on("close", (code) => {
				if (result !== null) send({ type: "result", output: result });
				else if (code !== 0 && !request.signal.aborted) {
					send({ type: "error", message: stderr.trim().slice(-500) || `claude가 ${code}로 끝났습니다.` });
				}
				finish();
			});
		},
	});
	return new Response(stream, {
		headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
	});
}
