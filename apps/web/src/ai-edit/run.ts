import { EditorCore } from "@/core";
import { getMessages } from "@/i18n";
import { compareFileNames } from "@/media/filename-order";
import type { MediaAsset } from "@/media/types";
import { fetchTtsServer } from "@/tts/client";
import { initialForm, useTtsStore } from "@/tts/components/tts-view";
import { styleFor, toVoiceSettings } from "@/tts/components/voice-fields";
import { useBgmLibraryStore, useSoundLibraryStore } from "@/sounds/sound-library";
import { applyPlan, type EditVoice } from "./apply";
import { buildClipSheet, type ClipSheet } from "./frames";
import { FORMATS, parsePlan, type ReviseScope, revisePlan } from "./plan";
import { isChannelSfx } from "./sfx-palette";
import { AI_EDIT_STEPS, type LastAiEdit, useAiEditStore } from "./store";
import { buildPrompt, buildRevisePrompt, type PromptClip } from "./style";

const MAX_LOG_LINES = 200;
// Claude가 단계를 넘어갈 때 내는 "[2/5] …" 줄
const STEP_LINE = /^\[(\d)\/5\]/m;
// 이보다 긴 소리는 효과음이 아니라 배경음이라 컷에 붙이지 않는다. 채널에서 쓰던 소리는 길어도 앞머리만 쓰니 더 봐준다
const MAX_SFX_SECONDS = 3;
const MAX_CHANNEL_SFX_SECONDS = 10;
// 다시 다듬을 때 촬영본을 또 훑지 않게, 한 번 만든 스틸 시트는 창을 닫을 때까지 둔다(미디어 id → 시트)
const sheetCache = new Map<string, ClipSheet>();

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

/**
 * 내레이션을 읽을 목소리. 아내는 대본 읽기 탭에서 고른 값(없으면 첫 목소리), 남편은 설정 → AI에서 고른 목소리(없으면 아내와 다른 첫 목소리).
 * 목소리가 하나뿐이면 둘 다 그 목소리다. 합성 서버가 꺼져 있으면 null
 */
async function loadVoices(): Promise<Record<"wife" | "husband", EditVoice> | null> {
	try {
		const { voices, config } = await fetchTtsServer();
		if (voices.length === 0) return null;
		const server = { status: "ready" as const, voices, config };
		const form = useTtsStore.getState().form ?? initialForm({ server });
		const wife = toVoiceSettings({ form, server });
		const chosen = useAiEditStore.getState().husbandVoice;
		const other =
			voices.find((voice) => voice.name === chosen) ?? voices.find((voice) => voice.name !== form.voice);
		const husband = other
			? toVoiceSettings({
					form: { ...form, voice: other.name, style: styleFor({ voice: other, style: form.style }) },
					server,
				})
			: wife;
		return { wife, husband };
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

function timelineVideoIds(): string[] {
	return EditorCore.getInstance()
		.scenes.getActiveScene()
		.tracks.flatMap((track) => track.elements.map((element) => ({ type: element.type, id: element.id })))
		.filter((element) => element.type === "video")
		.map((element) => element.id);
}

/** 지금 타임라인에 남아 있는 지난 AI 편집. 없으면(다른 프로젝트·형식, ⌘Z, 전부 삭제) null이고 처음부터 편집한다 */
function previousAiEdit(): LastAiEdit | null {
	// shortcut: 지난 계획을 고쳐 타임라인을 다시 짠다. AI 편집 뒤 손으로 고친 건 반영하지 못한다. 필요해지면 타임라인에서 계획을 거꾸로 읽는다
	const { last, format } = useAiEditStore.getState();
	const onTimeline = timelineVideoIds();
	return last?.projectId === EditorCore.getInstance().project.getActive().metadata.id &&
		last.format === format &&
		last.elementIds.some((id) => onTimeline.includes(id))
		? last
		: null;
}

/** AI Auto 편집 버튼. 지난 AI 편집이 타임라인에 있으면 무엇을 다듬을지 먼저 묻고, 없으면 바로 처음부터 편집한다 */
export function startAiEdit() {
	if (previousAiEdit()) useAiEditStore.setState({ job: { status: "choosing" } });
	else void runAiEdit();
}

/**
 * 미디어 패널의 동영상을 Claude에게 보여 주고 받은 계획을 타임라인에 적용한다.
 * 지난 AI 편집이 타임라인에 남아 있으면 처음부터 하지 않고 그 계획에서 고른 범위(scope)의 고칠 곳만 받아 얹는다.
 * 진행 상황은 useAiEditStore.job에 쌓이고, 화면은 그동안 AiEditOverlay가 막는다
 */
export async function runAiEdit({ scope: wanted = "all" }: { scope?: ReviseScope } = {}): Promise<void> {
	const m = getMessages();
	const editor = EditorCore.getInstance();
	const store = useAiEditStore;
	if (store.getState().job.status === "running") return;
	const abort = new AbortController();
	const previous = previousAiEdit();
	const scope = previous ? wanted : null;
	// 촬영본 스틸은 처음 편집할 때와, 컷을 다시 볼 수 있는 범위에만 만든다
	const needsSheets = scope === null || scope === "all" || scope === "cuts";
	store.setState({ job: { status: "running", step: 1, log: previous ? [m.aiEdit.revising] : [], abort, scope } });

	try {
		const videos = editor.media
			.getAssets()
			.filter((asset) => asset.type === "video")
			.sort((a, b) => compareFileNames(a.name, b.name));
		if (videos.length === 0) throw new Error(m.aiEdit.noVideos);

		const format = store.getState().format;
		const projectId = editor.project.getActive().metadata.id;

		// 다듬을 때는 지난 계획의 클립 번호를 그대로 쓰고, 새로 넣은 영상은 그 뒤 번호를 받는다
		const known = new Map(Object.entries(previous?.clips ?? {}).map(([id, assetId]) => [assetId, id]));
		let lastNumber = Math.max(0, ...[...known.values()].map((id) => Number(id.slice(1))));
		const clips: Record<string, MediaAsset> = {};
		const promptClips: PromptClip[] = [];
		const sheets: { name: string; dataUrl: string }[] = [];
		for (const [index, asset] of videos.entries()) {
			abort.signal.throwIfAborted();
			const id = known.get(asset.id) ?? `c${String(++lastNumber).padStart(2, "0")}`;
			if (!needsSheets) {
				clips[id] = asset;
				promptClips.push({ id, name: asset.name, duration: asset.duration ?? 0, times: [], sheetFile: "" });
				continue;
			}
			const cached = sheetCache.get(asset.id);
			// 다듬을 때는 Claude가 필요한 시트만 여니, 촬영본을 다시 훑는 것처럼 적지 않는다
			if (!cached) {
				const progress = { current: index + 1, total: videos.length, name: asset.name };
				log({ text: previous ? m.aiEdit.preparingClip(progress) : m.aiEdit.readingClip(progress) });
			}
			const sheet = cached ?? (await buildClipSheet({ asset }));
			if (!sheet) continue;
			sheetCache.set(asset.id, sheet);
			clips[id] = asset;
			sheets.push({ name: `${id}.jpg`, dataUrl: sheet.sheet });
			promptClips.push({ id, name: asset.name, duration: asset.duration ?? 0, times: sheet.times, sheetFile: `${id}.jpg` });
		}
		if (promptClips.length === 0) throw new Error(m.aiEdit.noVideos);

		const voices = await loadVoices();
		if (!voices) log({ text: m.aiEdit.noVoice });
		await useSoundLibraryStore.getState().load();
		const sounds = useSoundLibraryStore
			.getState()
			.sounds.filter(
				(sound) =>
					sound.duration > 0 &&
					sound.duration <= (isChannelSfx(sound.fileName) ? MAX_CHANNEL_SFX_SECONDS : MAX_SFX_SECONDS),
			);
		await useBgmLibraryStore.getState().load();
		const bgms = useBgmLibraryStore.getState().sounds;

		const promptBase = {
			clips: promptClips,
			canvas: FORMATS[format],
			hasVoice: voices !== null,
			hasHusbandVoice: voices !== null && voices.husband.voiceSettings.voice !== voices.wife.voiceSettings.voice,
			sounds: sounds.map((sound) => sound.fileName),
			bgms: bgms.map((sound) => sound.fileName),
		};
		log({ text: previous ? m.aiEdit.askingRevise : m.aiEdit.asking });
		const response = await fetch("/api/ai-edit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			signal: abort.signal,
			body: JSON.stringify({
				model: store.getState().model,
				effort: store.getState().effort,
				sheets,
				prompt:
					previous && scope
						? buildRevisePrompt({
								...promptBase,
								scope,
								plan: previous.plan,
								timing: previous.timing,
								seen: Object.keys(previous.clips),
							})
						: buildPrompt({ ...promptBase, recent: store.getState().recentHooks }),
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

		const limits = {
			output,
			durations: Object.fromEntries(promptClips.map((clip) => [clip.id, clip.duration])),
			sounds: promptBase.sounds,
			bgms: promptBase.bgms,
		};
		const revised = previous && scope ? revisePlan({ ...limits, previous: previous.plan, scope }) : null;
		const plan = revised?.plan ?? parsePlan(limits);
		if (revised && !revised.changed) {
			// 고칠 게 없으면 타임라인은 건드리지 않는다
			store.setState(({ job }) => ({
				job: {
					status: "done",
					plan: { ...plan, review: [m.aiEdit.noChanges, ...plan.review] },
					log: "log" in job ? job.log : [],
					scope,
				},
			}));
			return;
		}
		log({ text: m.aiEdit.applying({ count: plan.beats.length }), step: AI_EDIT_STEPS });
		const timing = await applyPlan({
			editor,
			plan,
			clips,
			voices,
			format,
			sounds,
			bgms,
			signal: abort.signal,
			onProgress: ({ current, total }) => log({ text: m.aiEdit.voicing({ current, total }) }),
		});
		if (!previous) store.getState().rememberHook(plan.hook);
		store.setState({
			last: {
				projectId,
				format,
				plan,
				clips: Object.fromEntries(Object.entries(clips).map(([id, asset]) => [id, asset.id])),
				timing,
				elementIds: timelineVideoIds(),
			},
		});
		store.setState(({ job }) => ({ job: { status: "done", plan, log: "log" in job ? job.log : [], scope } }));
	} catch (error) {
		if (abort.signal.aborted) {
			store.setState({ job: { status: "idle" } });
			return;
		}
		// 실패는 진행 카드에 보여 준다. console.error는 개발 서버가 전체 화면 오류로 덮어 버린다
		console.warn("AI edit failed:", error);
		store.setState(({ job }) => ({
			job: {
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
				log: "log" in job ? job.log : [],
			},
		}));
	}
}
