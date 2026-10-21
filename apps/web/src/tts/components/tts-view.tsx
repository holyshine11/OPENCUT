"use client";

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
import { getMessages, useMessages } from "@/i18n";
import settings from "@/tts/settings.json";
import {
	fetchTtsServer,
	TtsError,
	type TtsConfig,
	type TtsPreset,
	type TtsVoice,
} from "@/tts/client";
import { generateScriptAudio } from "@/tts/insert";
import { splitSentences } from "@/tts/sentences";

type ServerState =
	| { status: "loading" }
	| { status: "ready"; voices: TtsVoice[]; config: TtsConfig }
	| { status: "offline"; error: string };

type Job =
	| { status: "idle"; error: string | null }
	| { status: "running"; current: number; total: number };

interface TtsForm {
	voice: string;
	style: string;
	/** 고른 프리셋 이름. 값을 손으로 바꾸면 비운다 */
	preset: string | null;
	strength: number;
	expressiveness: number;
	speed: number;
	pause: number;
	makeCaptions: boolean;
	script: string;
}

type LevelKey = "strength" | "expressiveness" | "speed" | "pause";

interface TtsStore {
	server: ServerState;
	form: TtsForm | null;
	job: Job;
	abort: AbortController | null;
}

// 탭을 옮겨도 대본과 진행 중인 작업이 남도록 패널 밖에 둔다
const useTtsStore = create<TtsStore>()(() => ({
	server: { status: "loading" },
	form: null,
	job: { status: "idle", error: null },
	abort: null,
}));

/** 목소리에 없는 말투면 그 목소리의 첫 말투(기본)로 바꾼다 */
function styleFor({ voice, style }: { voice: TtsVoice | undefined; style: string }): string {
	if (!voice) return style;
	return voice.styles.some((item) => item.id === style)
		? style
		: (voice.styles[0]?.id ?? style);
}

function defaultLevels({ config }: { config: TtsConfig }): Record<LevelKey, number> {
	const first = config.presets[0];
	return {
		strength: first?.strength ?? settings.fallbackLevels.strength,
		expressiveness: first?.expressiveness ?? settings.fallbackLevels.expressiveness,
		speed: config.speed,
		pause: config.pause,
	};
}

function applyPreset({
	form,
	preset,
	voices,
}: {
	form: TtsForm;
	preset: TtsPreset;
	voices: TtsVoice[];
}): TtsForm {
	return {
		...form,
		preset: preset.name,
		style: styleFor({
			voice: voices.find((voice) => voice.name === form.voice),
			style: preset.style,
		}),
		strength: preset.strength,
		expressiveness: preset.expressiveness,
		speed: preset.speed,
		pause: preset.pause,
	};
}

async function loadServer() {
	useTtsStore.setState({ server: { status: "loading" } });
	try {
		const { voices, config } = await fetchTtsServer();
		const { form } = useTtsStore.getState();
		const firstVoice = voices[0];
		const initial: TtsForm = form ?? {
			voice: firstVoice?.name ?? "",
			style: firstVoice?.styles[0]?.id ?? "",
			preset: null,
			...defaultLevels({ config }),
			makeCaptions: true,
			script: "",
		};
		const firstPreset = config.presets[0];
		useTtsStore.setState({
			server: { status: "ready", voices, config },
			form:
				form || !firstPreset
					? initial
					: applyPreset({ form: initial, preset: firstPreset, voices }),
		});
	} catch (error) {
		useTtsStore.setState({
			server: {
				status: "offline",
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
}

function updateForm(patch: Partial<TtsForm>) {
	const { form } = useTtsStore.getState();
	if (form) useTtsStore.setState({ form: { ...form, ...patch } });
}

async function generate({
	sentences,
	form,
	server,
}: {
	sentences: string[];
	form: TtsForm;
	server: Extract<ServerState, { status: "ready" }>;
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
		await generateScriptAudio({
			editor,
			sentences,
			voiceSettings: {
				voice: form.voice,
				style: form.style,
				speed: form.speed,
				pause: form.pause,
				question: server.config.question,
				strength: form.strength,
				expressiveness: form.expressiveness,
			},
			model: server.voices.find((voice) => voice.name === form.voice)?.model ?? "",
			captionLayout: form.makeCaptions
				? useCaptionLayouts.getState().layouts[captionFormOf({ canvasSize })]
				: null,
			signal: abort.signal,
			onProgress: ({ current, total }) =>
				useTtsStore.setState({ job: { status: "running", current, total } }),
		});
		useTtsStore.setState({ job: { status: "idle", error: null } });
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
		if (error instanceof TtsError && error.status === 503) void loadServer();
	} finally {
		useTtsStore.setState({ abort: null });
	}
}

export function TtsView() {
	const m = useMessages();
	const server = useTtsStore((state) => state.server);
	const form = useTtsStore((state) => state.form);
	const job = useTtsStore((state) => state.job);
	const abort = useTtsStore((state) => state.abort);
	const captionForm = useEditor((e) =>
		captionFormOf({ canvasSize: e.project.getActive().settings.canvasSize }),
	);

	useEffect(() => {
		if (useTtsStore.getState().server.status !== "ready") void loadServer();
	}, []);

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
	const voice = ready?.voices.find((item) => item.name === form?.voice);
	const disabled = !ready || !form || isRunning;

	return (
		<PanelView title={m.assets.tabs.tts} contentClassName="px-0 flex flex-col h-full">
			<Section showTopBorder={false} showBottomBorder={false} className="flex-1">
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					{server.status === "loading" && (
						<div className="text-muted-foreground flex items-center gap-2 text-sm">
							<Spinner />
							{m.tts.connecting}
						</div>
					)}
					{server.status === "offline" && (
						<div className="bg-destructive/10 border-destructive/20 flex flex-col gap-2 rounded-md border p-3">
							<p className="text-destructive text-sm font-medium">{m.tts.offlineTitle}</p>
							<p className="text-destructive text-xs">{server.error}</p>
							<p className="text-muted-foreground text-xs">{m.tts.offlineHint}</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => void loadServer()}
							>
								{m.tts.retry}
							</Button>
						</div>
					)}
					{ready && form && (
						<SectionFields>
							<SectionField label={m.tts.voice}>
								<Select
									value={form.voice}
									disabled={isRunning}
									onValueChange={(value) =>
										updateForm({
											voice: value,
											style: styleFor({
												voice: ready.voices.find((item) => item.name === value),
												style: form.style,
											}),
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ready.voices.map((item) => (
											<SelectItem key={item.name} value={item.name}>
												{item.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</SectionField>
							<SectionField label={m.tts.preset}>
								<Select
									value={form.preset ?? ""}
									disabled={isRunning}
									onValueChange={(value) => {
										const preset = ready.config.presets.find(
											(item) => item.name === value,
										);
										if (preset) {
											useTtsStore.setState({
												form: applyPreset({ form, preset, voices: ready.voices }),
											});
										}
									}}
								>
									<SelectTrigger>
										<SelectValue placeholder={m.tts.customPreset} />
									</SelectTrigger>
									<SelectContent>
										{ready.config.presets.map((item) => (
											<SelectItem key={item.name} value={item.name}>
												{item.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</SectionField>
							<SectionField label={m.tts.style}>
								<Select
									value={form.style}
									disabled={isRunning}
									onValueChange={(value) => updateForm({ style: value, preset: null })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{(voice?.styles ?? []).map((item) => (
											<SelectItem key={item.id} value={item.id}>
												{item.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</SectionField>
							<LevelSlider
								label={m.tts.strength}
								field="strength"
								value={form.strength}
								min={settings.level.min}
								max={settings.level.max}
								step={settings.level.step}
								config={ready.config}
								disabled={isRunning}
							/>
							<LevelSlider
								label={m.tts.expressiveness}
								field="expressiveness"
								value={form.expressiveness}
								min={settings.level.min}
								max={settings.level.max}
								step={settings.level.step}
								config={ready.config}
								disabled={isRunning}
							/>
							<LevelSlider
								label={m.tts.speed}
								field="speed"
								value={form.speed}
								min={ready.config.speed_min}
								max={ready.config.speed_max}
								step={ready.config.speed_step}
								format={(value) => `${value.toFixed(2)}×`}
								config={ready.config}
								disabled={isRunning}
							/>
							<LevelSlider
								label={m.tts.pause}
								field="pause"
								value={form.pause}
								min={ready.config.pause_min}
								max={ready.config.pause_max}
								step={ready.config.pause_step}
								format={(value) => m.tts.seconds({ value: value.toFixed(2) })}
								config={ready.config}
								disabled={isRunning}
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

					<Button
						type="button"
						className="mt-auto w-full"
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

/** ⌘-click하면 서버 /config 기본값(감정 강도·표현력은 첫 프리셋 값)으로 돌아간다 */
function LevelSlider({
	label,
	field,
	value,
	min,
	max,
	step,
	format = String,
	config,
	disabled,
}: {
	label: string;
	field: LevelKey;
	value: number;
	min: number;
	max: number;
	step: number;
	format?: (value: number) => string;
	config: TtsConfig;
	disabled: boolean;
}) {
	return (
		<SectionField label={label}>
			<div className="flex items-center gap-3">
				<Slider
					aria-label={label}
					min={min}
					max={max}
					step={step}
					value={[value]}
					disabled={disabled}
					onValueChange={([next]) => updateForm({ [field]: next, preset: null })}
					onReset={() =>
						updateForm({ [field]: defaultLevels({ config })[field], preset: null })
					}
				/>
				<span className="text-muted-foreground w-14 shrink-0 text-right text-xs tabular-nums">
					{format(value)}
				</span>
			</div>
		</SectionField>
	);
}
