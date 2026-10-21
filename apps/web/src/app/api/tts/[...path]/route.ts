// 대본 읽기 합성 서버(apps/tts/tts-web.py)로 요청을 넘긴다. 브라우저가 서버에 바로 보내면 CORS에 걸린다.
// 주소는 요청마다 TTS_URL에서 읽는다. next.config의 rewrites는 빌드할 때 주소가 굳어서 쓰지 않는다
import type { NextRequest } from "next/server";

const ALLOWED_PATHS = {
	GET: ["voices", "config"],
	POST: ["synth"],
} as const;

type Method = keyof typeof ALLOWED_PATHS;

const OFFLINE_MESSAGE =
	"TTS 서버가 꺼져 있습니다. bun run dev:web으로 다시 켜세요. 처음이면 apps/tts/setup-mac.sh로 먼저 설치하세요.";
const UNCONFIGURED_MESSAGE =
	"TTS 서버 주소(TTS_URL)가 설정되지 않았습니다. apps/web/.env.local에 TTS_URL을 넣으세요.";

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward({
	request,
	context,
	method,
}: {
	request: NextRequest;
	context: RouteContext;
	method: Method;
}): Promise<Response> {
	const path = (await context.params).path.join("/");
	const allowed: readonly string[] = ALLOWED_PATHS[method];
	if (!allowed.includes(path)) {
		return Response.json({ error: "없는 주소입니다." }, { status: 404 });
	}

	const baseUrl = process.env.TTS_URL;
	if (!baseUrl) {
		return Response.json({ error: UNCONFIGURED_MESSAGE }, { status: 503 });
	}

	let upstream: Response;
	try {
		upstream = await fetch(new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`), {
			method,
			headers: { "Content-Type": request.headers.get("Content-Type") ?? "application/json" },
			body: method === "POST" ? await request.arrayBuffer() : undefined,
			// 브라우저가 취소하면 합성 요청도 끊는다
			signal: request.signal,
			cache: "no-store",
		});
	} catch (error) {
		if (request.signal.aborted) return new Response(null, { status: 499 });
		console.error("TTS server unreachable:", error);
		return Response.json({ error: OFFLINE_MESSAGE }, { status: 503 });
	}

	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
		},
	});
}

/* eslint-disable opencut/prefer-object-params -- Next 라우트 핸들러는 (request, context)를 받아야 한다 */
export function GET(request: NextRequest, context: RouteContext) {
	return forward({ request, context, method: "GET" });
}

export function POST(request: NextRequest, context: RouteContext) {
	return forward({ request, context, method: "POST" });
}
/* eslint-enable opencut/prefer-object-params */
