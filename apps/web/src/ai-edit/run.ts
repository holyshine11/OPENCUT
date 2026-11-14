import { EditorCore } from "@/core";
import { getMessages } from "@/i18n";
import { compareFileNames } from "@/media/filename-order";
import type { MediaAsset } from "@/media/types";
import { fetchTtsServer } from "@/tts/client";
import { initialForm, useTtsStore } from "@/tts/components/tts-view";
import { toVoiceSettings } from "@/tts/components/voice-fields";
import { applyPlan } from "./apply";
import { buildClipSheet } from "./frames";
import { parsePlan } from "./plan";
import { AI_EDIT_STEPS, useAiEditStore } from "./store";
import { buildPrompt, type PromptClip } from "./style";

const MAX_LOG_LINES = 200;
// Claude가 단계를 넘어갈 때 내는 "[2/5] …" 줄
const STEP_LINE = /^\[(\d)\/5\]/m;

function log({ text, step }: { text: string; step?: number }) {
	useAiEditStore.setState(({ job }) =>
		job.status === "running"
			? {
					job: {
						...job,
						step: Math.max(job.step, step ?? job.step),
						log: [...job.log, text].slice(-MAX_LOG_LINES),
					},
				}
			: {},
	);
}

/** 내레이션을 읽을 목소리. 대본 읽기 탭에서 고른 값이 있으면 그대로, 없으면 첫 목소리. 합성 서버가 꺼져 있으면 null */
async function loadVoice() {
	try {
		const { voices, config } = await fetchTtsServer();
		if (voices.length === 0) return null;
		const server = { status: "ready" as const, voices, config };
		return toVoiceSettings({ form: useTtsStore.getState().form ?? initialForm({ server }), server });
	} catch {
		return null;
	}
}

async function readEvents({
	response,
	onEvent,
}: {
	response: Response;
	onEvent: (event: { type: string; text?: string; output?: string; message?: string }) => void;
}) {
	if (!response.body) return;
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += value;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) if (line) onEvent(JSON.parse(line));
	}
}

/**
 * 미디어 패널의 동영상을 Claude에게 보여 주고 받은 계획을 타임라인에 적용한다.
 * 진행 상황은 useAiEditStore.job에 쌓이고, 화면은 그동안 AiEditOverlay가 막는다
 */
export async function runAiEdit(): Promise<void> {
	const m = getMessages();
	const editor = EditorCore.getInstance();
	const store = useAiEditStore;
	if (store.getState().job.status === "running") return;
	const abort = new AbortController();
	store.setState({ job: { status: "running", step: 1, log: [], abort } });

	try {
		const videos = editor.media
			.getAssets()
			.filter((asset) => asset.type === "video")
			.sort((a, b) => compareFileNames(a.name, b.name));
		if (videos.length === 0) throw new Error(m.aiEdit.noVideos);

		const clips: Record<string, MediaAsset> = {};
		const promptClips: PromptClip[] = [];
		const sheets: { name: string; dataUrl: string }[] = [];
		for (const [index, asset] of videos.entries()) {
			abort.signal.throwIfAborted();
			log({ text: m.aiEdit.readingClip({ current: index + 1, total: videos.length, name: asset.name }) });
			const sheet = await buildClipSheet({ asset });
			if (!sheet) continue;
			const id = `c${String(index + 1).padStart(2, "0")}`;
			clips[id] = asset;
			sheets.push({ name: `${id}.jpg`, dataUrl: sheet.sheet });
			promptClips.push({ id, name: asset.name, duration: asset.duration ?? 0, times: sheet.times, sheetFile: `${id}.jpg` });
		}
		if (sheets.length === 0) throw new Error(m.aiEdit.noVideos);

		const voice = await loadVoice();
		if (!voice) log({ text: m.aiEdit.noVoice });

		log({ text: m.aiEdit.asking });
		const response = await fetch("/api/ai-edit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal: abort.signal,
			body: JSON.stringify({
				model: store.getState().model,
				sheets,
				prompt: buildPrompt({
					clips: promptClips,
					// 적용할 때 화면 크기가 촬영본에 맞춰지니(applyPlan) 쇼츠·롱폼도 촬영본 방향으로 정한다
					canvas:
						videos[0].width && videos[0].height
							? { width: videos[0].width, height: videos[0].height }
							: editor.project.getActive().settings.canvasSize,
					hasVoice: voice !== null,
					recent: store.getState().recentHooks,
				}),
			}),
		});
		if (!response.ok) {
			const body: unknown = await response.json().catch(() => null);
			throw new Error(
				body && typeof body === "object" && "error" in body && typeof body.error === "string"
					? body.error
					: `${response.status}`,
			);
		}

		let output: string | null = null;
		let failure: string | null = null;
		await readEvents({
			response,
			onEvent: (event) => {
				if (event.type === "log" && event.text) {
					// 마지막 메시지에 붙은 계획 JSON은 결과 화면에서 보여 주니 진행 기록에서는 뗀다
					const text = event.text.split(/(^|\n)\s*\{/)[0].trim();
					const step = Number(STEP_LINE.exec(text)?.[1]);
					if (text) log({ text, step: step >= 1 && step <= AI_EDIT_STEPS ? step : undefined });
				} else if (event.type === "result" && event.output) output = event.output;
				else if (event.type === "error") failure = event.message ?? m.aiEdit.failed;
			},
		});
		if (failure) throw new Error(failure);
		if (output === null) throw new Error(m.aiEdit.failed);

		const plan = parsePlan({
			output,
			durations: Object.fromEntries(promptClips.map((clip) => [clip.id, clip.duration])),
		});
		log({ text: m.aiEdit.applying({ count: plan.beats.length }), step: AI_EDIT_STEPS });
		await applyPlan({
			editor,
			plan,
			clips,
			voice,
			signal: abort.signal,
			onProgress: ({ current, total }) => log({ text: m.aiEdit.voicing({ current, total }) }),
		});
		store.getState().rememberHook(plan.hook);
		store.setState(({ job }) => ({ job: { status: "done", plan, log: "log" in job ? job.log : [] } }));
	} catch (error) {
		if (abort.signal.aborted) {
			store.setState({ job: { status: "idle" } });
			return;
		}
		console.error("AI edit failed:", error);
		store.setState(({ job }) => ({
			job: {
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
				log: "log" in job ? job.log : [],
			},
		}));
	}
}
