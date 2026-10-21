"use client";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { CaptionLayoutFields } from "@/subtitles/components/caption-layout-fields";
import {
	captionFormOf,
	useCaptionLayouts,
} from "@/transcription/caption-layout-store";
import { useEditor } from "@/editor/use-editor";
import { EditorCore } from "@/core";
import { getMessages, translateLabel, useMessages } from "@/i18n";
import type { Messages } from "@/i18n/messages/en";
import type { SceneTracks } from "@/timeline";
import settings from "@/tts/settings.json";
import { TtsError } from "@/tts/client";
import { generateScriptAudio } from "@/tts/insert";
import { splitSentences } from "@/tts/sentences";
import { pickTtsTargets } from "@/tts/targets";
import {
	applyPreset,
	defaultLevels,
	loadTtsServer,
	type ReadyTtsServer,
	toVoiceSettings,
	TtsServerNotice,
	TtsVoiceFields,
	type TtsVoiceForm,
	useTtsServer,
} from "./voice-fields";

type Job =
	| { status: "idle"; error: string | null }
	| { status: "running"; current: number; total: number };

interface TtsForm extends TtsVoiceForm {
	makeCaptions: boolean;
	script: string;
}

interface TtsStore {
	form: TtsForm | null;
	job: Job;
	abort: AbortController | null;
}

// 탭을 옮겨도 대본과 진행 중인 작업이 남도록 패널 밖에 둔다
const useTtsStore = create<TtsStore>()(() => ({
	form: null,
	job: { status: "idle", error: null },
	abort: null,
}));

/** 처음 연결되면 첫 목소리·첫 프리셋으로 채운다 */
function initialForm({ server }: { server: ReadyTtsServer }): TtsForm {
	const firstVoice = server.voices[0];
	const form: TtsForm = {
		voice: firstVoice?.name ?? "",
		style: firstVoice?.styles[0]?.id ?? "",
		preset: null,
		...defaultLevels({ config: server.config }),
		makeCaptions: true,
		script: "",
	};
	const firstPreset = server.config.presets[0];
	return firstPreset
		? applyPreset({ form, preset: firstPreset, voices: server.voices })
		: form;
}

function updateForm(patch: Partial<TtsForm>) {
	const { form } = useTtsStore.getState();
	if (form) useTtsStore.setState({ form: { ...form, ...patch } });
}

/** 트랙 이름. 같은 이름의 같은 종류 트랙이 여럿이면 위에서부터 번호를 붙인다 */
function trackLabel({
	tracks,
	trackId,
	m,
}: {
	tracks: SceneTracks;
	trackId: string;
	m: Messages;
}): string {
	const track = tracks.find((item) => item.id === trackId);
	if (!track) return "";
	const sameName = tracks.filter(
		(item) => item.type === track.type && item.name === track.name,
	);
	const name = translateLabel({ messages: m, label: track.name });
	return sameName.length > 1 ? `${name} ${sameName.indexOf(track) + 1}` : name;
}

async function generate({
	sentences,
	form,
	server,
}: {
	sentences: string[];
	form: TtsForm;
	server: ReadyTtsServer;
}) {
	const m = getMessages();
	const editor = EditorCore.getInstance();
	const abort = new AbortController();
	useTtsStore.setState({
		abort,
		job: { status: "running", current: 0, total: sentences.length },
	});
	const canvasSize = editor.project.getActive().settings.canvasSize;
	try {
		const { audioMoved, captionsMoved } = await generateScriptAudio({
			editor,
			sentences,
			...toVoiceSettings({ form, server }),
			captionLayout: form.makeCaptions
				? useCaptionLayouts.getState().layouts[captionFormOf({ canvasSize })]
				: null,
			signal: abort.signal,
			onProgress: ({ current, total }) =>
				useTtsStore.setState({ job: { status: "running", current, total } }),
		});
		useTtsStore.setState({ job: { status: "idle", error: null } });
		if (audioMoved || captionsMoved) {
			toast.info(m.tts.movedToNewTrack({ audio: audioMoved, captions: captionsMoved }));
		}
	} catch (error) {
		if (abort.signal.aborted) {
			useTtsStore.setState({ job: { status: "idle", error: null } });
			return;
		}
		console.error("TTS generation failed:", error);
		const job = useTtsStore.getState().job;
		const sentence = job.status === "running" ? job.current : 0;
		const reason = error instanceof TtsError ? error.message : m.tts.processFailed;
		useTtsStore.setState({
			job: { status: "idle", error: m.tts.failed({ sentence, reason }) },
		});
		// 서버가 꺼졌으면 안내를 띄운다
		if (error instanceof TtsError && error.status === 503) void loadTtsServer();
	} finally {
		useTtsStore.setState({ abort: null });
	}
}

export function TtsView() {
	const m = useMessages();
	const server = useTtsServer((state) => state.server);
	const form = useTtsStore((state) => state.form);
	const job = useTtsStore((state) => state.job);
	const abort = useTtsStore((state) => state.abort);
	const captionForm = useEditor((e) =>
		captionFormOf({ canvasSize: e.project.getActive().settings.canvasSize }),
	);
	// 넣을 곳은 선택이 바뀔 때마다 다시 고른다. 겹침은 합성한 뒤 길이를 알아야 볼 수 있다
	const [audioTarget, captionTarget] = useEditor((e) => {
		const tracks = e.scenes.getActiveSceneOrNull()?.tracks ?? [];
		const { audioTrackId, captionTrackId } = pickTtsTargets({
			tracks,
			selectedTrackIds: e.selection.getSelectedTrackIds(),
			selectedElements: e.selection.getSelectedElements(),
		});
		return [
			audioTrackId ? trackLabel({ tracks, trackId: audioTrackId, m }) : m.tts.newAudioTrack,
			captionTrackId
				? trackLabel({ tracks, trackId: captionTrackId, m })
				: m.tts.newCaptionTrack,
		];
	});

	useEffect(() => {
		if (useTtsServer.getState().server.status !== "ready") void loadTtsServer();
	}, []);
	useEffect(() => {
		if (server.status === "ready" && !useTtsStore.getState().form) {
			useTtsStore.setState({ form: initialForm({ server }) });
		}
	}, [server]);

	const sentences = useMemo(
		() =>
			splitSentences({
				text: form?.script ?? "",
				maxChars: settings.maxSentenceChars,
			}),
		[form?.script],
	);

	const isRunning = job.status === "running";
	const ready = server.status === "ready" ? server : null;
	const disabled = !ready || !form || isRunning;

	return (
		<PanelView title={m.assets.tabs.tts} contentClassName="px-0 flex flex-col h-full">
			<Section showTopBorder={false} showBottomBorder={false} className="flex-1">
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<TtsServerNotice server={server} />
					{ready && form && (
						<SectionFields>
							<TtsVoiceFields
								form={form}
								onChange={(next) => useTtsStore.setState({ form: next })}
								server={ready}
								disabled={isRunning}
								showPause
							/>
							<div className="flex items-center justify-between text-xs">
								<label htmlFor="tts-make-captions">{m.tts.makeCaptions}</label>
								<Switch
									id="tts-make-captions"
									checked={form.makeCaptions}
									disabled={isRunning}
									onCheckedChange={(checked) => updateForm({ makeCaptions: checked })}
								/>
							</div>
							{form.makeCaptions && (
								<CaptionLayoutFields form={captionForm} disabled={isRunning} />
							)}
							<SectionField label={m.tts.script}>
								<Textarea
									value={form.script}
									placeholder={m.tts.scriptPlaceholder}
									disabled={isRunning}
									className="min-h-40"
									onChange={(event) => updateForm({ script: event.target.value })}
								/>
								<p className="text-muted-foreground text-xs">
									{m.tts.sentenceCount({ count: sentences.length })}
								</p>
							</SectionField>
						</SectionFields>
					)}

					<p className="text-muted-foreground mt-auto text-xs">
						{form?.makeCaptions === false
							? m.tts.target({ audio: audioTarget })
							: m.tts.targetWithCaptions({ audio: audioTarget, captions: captionTarget })}
					</p>
					<Button
						type="button"
						className="w-full"
						disabled={disabled || sentences.length === 0}
						onClick={() => {
							if (ready && form) void generate({ sentences, form, server: ready });
						}}
					>
						{isRunning && <Spinner className="mr-1" />}
						{isRunning
							? m.tts.progress({ current: job.current, total: job.total })
							: m.tts.generate}
					</Button>
					{isRunning && (
						<Button
							type="button"
							variant="outline"
							className="w-full"
							onClick={() => abort?.abort()}
						>
							{m.tts.cancel}
						</Button>
					)}
					{job.status === "idle" && job.error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{job.error}</p>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
