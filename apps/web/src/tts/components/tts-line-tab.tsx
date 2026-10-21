"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import { useMessages } from "@/i18n";
import type { AudioElement, TextElement } from "@/timeline";
import {
	captionFormOf,
	useCaptionLayouts,
} from "@/transcription/caption-layout-store";
import { TtsError } from "@/tts/client";
import { findLineAudio, findLineCaptions, isLineStale, joinCaptionText } from "@/tts/lines";
import { regenerateLine } from "@/tts/regenerate";
import {
	loadTtsServer,
	type ReadyTtsServer,
	toVoiceSettings,
	TtsServerNotice,
	TtsVoiceFields,
	type TtsVoiceForm,
	useTtsServer,
} from "./voice-fields";

type TtsAudioElement = AudioElement & { tts: NonNullable<AudioElement["tts"]> };

/**
 * 속성 패널의 "대본 읽기" 칸. 대본 읽기 음성 클립이나 그 자막을 고르면 뜬다.
 * 자막을 골랐으면 같은 lineId의 음성 클립을 다시 만든다
 */
export function TtsLineTab({ element }: { element: AudioElement | TextElement }) {
	const m = useMessages();
	const editor = useEditor();
	const server = useTtsServer((state) => state.server);

	useEffect(() => {
		if (useTtsServer.getState().server.status !== "ready") void loadTtsServer();
	}, []);

	// 속성 패널이 장면이 바뀔 때마다 다시 그리므로 여기서는 그때그때 찾는다
	const lineId = element.type === "audio" ? element.tts?.lineId : element.ttsLineId;
	const tracks = editor.scenes.getActiveScene().tracks;
	const audio = lineId ? findLineAudio({ tracks, lineId }) : null;
	const captions = lineId ? findLineCaptions({ tracks, lineId }) : [];
	const tts = audio?.element.tts;
	const stale = tts ? isLineStale({ text: tts.text, captions }) : false;
	const captionText = joinCaptionText({ captions });

	return (
		<Section sectionKey={`${element.id}:tts`}>
			<SectionHeader>
				<SectionTitle>{m.properties.tabs.tts}</SectionTitle>
			</SectionHeader>
			<SectionContent className="flex flex-col gap-4">
				<TtsServerNotice server={server} />
				{!audio?.element.tts && (
					<p className="text-muted-foreground text-sm">{m.tts.noLinkedAudio}</p>
				)}
				{server.status === "ready" && audio && tts && (
					<LineForm
						// 다시 만들면(미디어가 바뀌면) 새 설정으로, 자막을 고치면 고친 글자로 다시 채운다
						key={`${audio.element.id}:${audio.element.sourceType === "upload" ? audio.element.mediaId : ""}:${stale ? captionText : ""}`}
						audio={{ ...audio.element, tts }}
						initialText={stale ? captionText : tts.text}
						stale={stale}
						fromCaption={element.type === "text"}
						server={server}
					/>
				)}
			</SectionContent>
		</Section>
	);
}

function LineForm({
	audio,
	initialText,
	stale,
	fromCaption,
	server,
}: {
	audio: TtsAudioElement;
	initialText: string;
	stale: boolean;
	fromCaption: boolean;
	server: ReadyTtsServer;
}) {
	const m = useMessages();
	const editor = useEditor();
	const [form, setForm] = useState<TtsVoiceForm & { text: string }>(() => ({
		voice: audio.tts.voice,
		style: audio.tts.style,
		preset: null,
		strength: audio.tts.strength,
		expressiveness: audio.tts.expressiveness,
		speed: audio.tts.speed,
		// 클립에 남기지 않는 값이라 서버 기본값으로 보낸다(한 문장 안 쉼표 쉼)
		pause: server.config.pause,
		text: initialText,
	}));
	const [abort, setAbort] = useState<AbortController | null>(null);
	const [error, setError] = useState<string | null>(null);
	const isRunning = abort !== null;

	const regenerate = async () => {
		const controller = new AbortController();
		setAbort(controller);
		setError(null);
		const canvasSize = editor.project.getActive().settings.canvasSize;
		try {
			const { caption } = await regenerateLine({
				editor,
				elementId: audio.id,
				text: form.text.trim(),
				...toVoiceSettings({ form, server }),
				captionLayout: useCaptionLayouts.getState().layouts[captionFormOf({ canvasSize })],
				signal: controller.signal,
			});
			// 자막을 골라 열었으면 새 첫 자막을, 음성을 골라 열었으면 그 음성을 계속 고른다
			const line = findLineAudio({
				tracks: editor.scenes.getActiveScene().tracks,
				lineId: audio.tts.lineId,
			});
			const selected = fromCaption
				? caption
				: line && { trackId: line.trackId, elementId: line.element.id };
			if (selected) editor.selection.setSelectedElements({ elements: [selected] });
		} catch (caught) {
			if (controller.signal.aborted) return;
			console.error("TTS regenerate failed:", caught);
			const reason = caught instanceof TtsError ? caught.message : m.tts.processFailed;
			setError(m.tts.regenerateFailed({ reason }));
			if (caught instanceof TtsError && caught.status === 503) void loadTtsServer();
		} finally {
			setAbort(null);
		}
	};

	return (
		<>
			{stale && (
				<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
					<p className="text-sm">{m.tts.staleNotice}</p>
				</div>
			)}
			<SectionFields>
				<SectionField label={m.tts.sentence}>
					<Textarea
						value={form.text}
						disabled={isRunning}
						className="min-h-20"
						onChange={(event) => setForm({ ...form, text: event.target.value })}
					/>
				</SectionField>
				<TtsVoiceFields
					form={form}
					onChange={setForm}
					server={server}
					disabled={isRunning}
					showPause={false}
				/>
			</SectionFields>
			<TooltipProvider delayDuration={0}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							className="w-full"
							disabled={isRunning || !form.text.trim()}
							onClick={() => void regenerate()}
						>
							{isRunning && <Spinner className="mr-1" />}
							{isRunning ? m.tts.regenerating : m.tts.regenerate}
						</Button>
					</TooltipTrigger>
					<TooltipContent>{m.tts.regenerateHint}</TooltipContent>
				</Tooltip>
			</TooltipProvider>
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
			{error && (
				<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			)}
		</>
	);
}
