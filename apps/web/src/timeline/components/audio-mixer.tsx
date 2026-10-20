"use client";

import { useEffect, useRef, useState } from "react";
import {
	Cancel01Icon,
	SlidersVerticalIcon,
	VolumeHighIcon,
	VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Popover as PopoverPrimitive } from "radix-ui";
import {
	PopoverClose,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/actions/components/action-tooltip";
import { useEditor } from "@/editor/use-editor";
import { translateLabel, useMessages } from "@/i18n";
import { canTrackHaveAudio, type TimelineTrack } from "@/timeline";
import { isTrackSilencedBySolo, linearToDb } from "@/timeline/audio-mix";
import type { AudioLoudness } from "@/core/managers/audio-manager";
import { VOLUME_DB_DEFAULT, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import { cn } from "@/utils/ui";

const METER_FLOOR_DB = -60;
/** 미터 바가 떨어지는 속도(프레임당 배율) */
const METER_FALLOFF = 0.9;
const PEAK_HOLD_MS = 1500;
const FADER_MAX_DB = 12;
const FADER_STEP_DB = 0.1;
const PAN_STEP = 0.01;
const LOUDNESS_REFRESH_MS = 200;

type AudibleTrack = Extract<TimelineTrack, { muted: boolean }>;

function dbToMeterFraction(db: number): number {
	const clamped = Math.min(0, Math.max(METER_FLOOR_DB, db));
	return (clamped - METER_FLOOR_DB) / -METER_FLOOR_DB;
}

function formatDb(db: number): string {
	if (db <= VOLUME_DB_MIN) return "-∞";
	return `${db > 0 ? "+" : ""}${db.toFixed(1)}`;
}

function formatPan(pan: number): string {
	if (Math.abs(pan) < PAN_STEP) return "C";
	return `${pan < 0 ? "L" : "R"}${Math.round(Math.abs(pan) * 100)}`;
}

/**
 * 세로 피크 미터. read()가 채널별 선형 피크를 돌려주면 rAF마다 바를 갱신한다.
 * 리미터 문턱(-1 dBFS)부터 빨간 구간이고, 0 dBFS를 넘으면 위 표시등이 켜진 채 남는다.
 */
export function AudioLevelMeter({
	read,
	channels,
	className,
}: {
	read: () => number[];
	channels: number;
	className?: string;
}) {
	const m = useMessages();
	const fillRefs = useRef<(HTMLDivElement | null)[]>([]);
	const holdRefs = useRef<(HTMLDivElement | null)[]>([]);
	const readRef = useRef(read);
	useEffect(() => {
		readRef.current = read;
	}, [read]);
	const [isClipped, setIsClipped] = useState(false);
	const clippedRef = useRef(false);

	useEffect(() => {
		const shown = new Array<number>(channels).fill(0);
		const holds = new Array<{ value: number; at: number }>(channels)
			.fill({ value: 0, at: 0 })
			.map(() => ({ value: 0, at: 0 }));
		let frame = 0;

		const tick = (now: number) => {
			const peaks = readRef.current();
			for (let channel = 0; channel < channels; channel++) {
				const peak = peaks[channel] ?? 0;
				if (peak >= 1 && !clippedRef.current) {
					clippedRef.current = true;
					setIsClipped(true);
				}
				const target = dbToMeterFraction(linearToDb(peak));
				shown[channel] = Math.max(target, shown[channel] * METER_FALLOFF);
				const hold = holds[channel];
				if (target >= hold.value || now - hold.at > PEAK_HOLD_MS) {
					hold.value = target;
					hold.at = now;
				}
				const fill = fillRefs.current[channel];
				if (fill) fill.style.height = `${(1 - shown[channel]) * 100}%`;
				const holdLine = holdRefs.current[channel];
				if (holdLine) {
					holdLine.style.bottom = `${hold.value * 100}%`;
					holdLine.style.opacity = hold.value > 0 ? "1" : "0";
				}
			}
			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [channels]);

	return (
		<div
			className={cn("flex h-full flex-col items-center gap-1", className)}
			role="img"
			aria-label={m.timeline.outputLevel}
		>
			<ActionTooltip label={m.timeline.resetClipIndicator}>
				<button
					type="button"
					aria-label={m.timeline.resetClipIndicator}
					className={cn(
						"h-1.5 w-full shrink-0 rounded-[1px]",
						isClipped ? "bg-red-500" : "bg-muted",
					)}
					onClick={() => {
						clippedRef.current = false;
						setIsClipped(false);
					}}
				/>
			</ActionTooltip>
			<div className="flex min-h-0 w-full flex-1 gap-px">
				{Array.from({ length: channels }, (_, channel) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: 채널 순서가 곧 식별자
						key={channel}
						// 빨강이 시작하는 98%가 리미터 문턱(-1 dBFS, 바닥 -60 기준) 자리다
						className="relative flex-1 overflow-hidden rounded-[1px] bg-linear-to-t from-emerald-500 via-yellow-400 via-80% to-red-500 to-98%"
					>
						<div
							ref={(node) => {
								fillRefs.current[channel] = node;
							}}
							className="bg-muted absolute inset-x-0 top-0 h-full"
						/>
						<div
							ref={(node) => {
								holdRefs.current[channel] = node;
							}}
							className="bg-foreground absolute inset-x-0 h-px opacity-0"
						/>
					</div>
				))}
			</div>
		</div>
	);
}

function formatLufs(lufs: number): string {
	return Number.isFinite(lufs) ? lufs.toFixed(1) : "-∞";
}

/** 라우드니스 숫자는 눈으로 읽을 만큼만 갱신한다 */
function useLoudness(): AudioLoudness {
	const editor = useEditor();
	const [loudness, setLoudness] = useState(() => editor.audio.getLoudness());
	useEffect(() => {
		const timer = window.setInterval(
			() => setLoudness(editor.audio.getLoudness()),
			LOUDNESS_REFRESH_MS,
		);
		return () => window.clearInterval(timer);
	}, [editor]);
	return loudness;
}

/** 타임라인 오른쪽 끝의 마스터 출력 미터와 숏텀 LUFS */
export function MasterMeterColumn() {
	const m = useMessages();
	const editor = useEditor();
	const { shortTerm } = useLoudness();
	return (
		<div className="bg-background flex w-8 shrink-0 flex-col items-center gap-1 border-l px-1 py-2">
			<AudioLevelMeter
				channels={2}
				className="w-4 min-h-0 flex-1"
				read={() => {
					const { left, right } = editor.audio.getMasterLevels();
					return [left, right];
				}}
			/>
			<ActionTooltip label={m.timeline.shortTermLoudness}>
				<span className="text-muted-foreground font-mono text-[9px] tabular-nums">
					{Number.isFinite(shortTerm) ? Math.round(shortTerm) : "-∞"}
				</span>
			</ActionTooltip>
		</div>
	);
}

function LoudnessReadout() {
	const m = useMessages();
	const editor = useEditor();
	const { momentary, shortTerm, integrated } = useLoudness();
	const rows = [
		[m.timeline.lufsMomentary, momentary],
		[m.timeline.lufsShortTerm, shortTerm],
		[m.timeline.lufsIntegrated, integrated],
	] as const;

	return (
		<ActionTooltip label={m.timeline.resetLoudness}>
			<button
				type="button"
				aria-label={m.timeline.resetLoudness}
				className="hover:bg-accent flex flex-col rounded-sm px-1 py-0.5 font-mono text-[9px] tabular-nums"
				onClick={() => editor.audio.resetLoudness()}
			>
				{rows.map(([label, value]) => (
					<span key={label} className="flex justify-between gap-1">
						<span className="text-muted-foreground truncate">{label}</span>
						<span>{formatLufs(value)}</span>
					</span>
				))}
				<span className="text-muted-foreground text-right">LUFS</span>
			</button>
		</ActionTooltip>
	);
}

function Fader({
	value,
	label,
	onPreview,
	onCommit,
}: {
	value: number;
	label: string;
	onPreview: (db: number) => void;
	onCommit: (db: number) => void;
}) {
	const [draft, setDraft] = useState<number | null>(null);
	const shown = draft ?? value;

	return (
		<div className="flex min-h-0 flex-1 flex-col items-center gap-1">
			<Slider
				orientation="vertical"
				aria-label={label}
				min={VOLUME_DB_MIN}
				max={FADER_MAX_DB}
				step={FADER_STEP_DB}
				value={[shown]}
				onValueChange={([db]) => {
					setDraft(db);
					onPreview(db);
				}}
				onValueCommit={([db]) => {
					setDraft(null);
					onCommit(db);
				}}
				onReset={() => onCommit(VOLUME_DB_DEFAULT)}
				onDoubleClick={() => onCommit(0)}
				className="min-h-0 flex-1"
			/>
			<span className="text-muted-foreground font-mono text-[10px] tabular-nums">
				{formatDb(shown)}
			</span>
		</div>
	);
}

function ChannelStrip({
	name,
	meter,
	fader,
	footer,
	isDimmed = false,
}: {
	isDimmed?: boolean;
	name: string;
	meter: React.ReactNode;
	fader: React.ReactNode;
	footer: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex h-80 w-24 shrink-0 flex-col gap-2 rounded-sm border p-2",
				isDimmed && "opacity-50",
			)}
		>
			<span className="truncate text-center text-xs" title={name}>
				{name}
			</span>
			<div className="flex min-h-0 flex-1 gap-2">
				{fader}
				<div className="w-3">{meter}</div>
			</div>
			{footer}
		</div>
	);
}

function TrackChannelStrip({
	track,
	isSilencedBySolo,
}: {
	track: AudibleTrack;
	isSilencedBySolo: boolean;
}) {
	const m = useMessages();
	const editor = useEditor();
	const [panDraft, setPanDraft] = useState<number | null>(null);
	const pan = panDraft ?? track.pan ?? 0;

	return (
		<ChannelStrip
			isDimmed={isSilencedBySolo || track.muted}
			name={translateLabel({ messages: m, label: track.name })}
			fader={
				<Fader
					value={track.volume ?? 0}
					label={m.timeline.trackVolume}
					onPreview={(volumeDb) =>
						editor.audio.previewTrackMix({ trackId: track.id, volumeDb })
					}
					onCommit={(volume) =>
						editor.timeline.setTrackMix({ trackId: track.id, volume })
					}
				/>
			}
			meter={
				<AudioLevelMeter
					channels={1}
					read={() => [editor.audio.getTrackLevel({ trackId: track.id })]}
				/>
			}
			footer={
				<>
					<div className="flex flex-col gap-1">
						<Slider
							aria-label={m.timeline.pan}
							min={-1}
							max={1}
							step={PAN_STEP}
							value={[pan]}
							onValueChange={([value]) => {
								setPanDraft(value);
								editor.audio.previewTrackMix({ trackId: track.id, pan: value });
							}}
							onValueCommit={([value]) => {
								setPanDraft(null);
								editor.timeline.setTrackMix({ trackId: track.id, pan: value });
							}}
							onDoubleClick={() =>
								editor.timeline.setTrackMix({ trackId: track.id, pan: 0 })
							}
							onReset={() =>
								editor.timeline.setTrackMix({ trackId: track.id, pan: 0 })
							}
						/>
						<span className="text-muted-foreground text-center font-mono text-[10px]">
							{m.timeline.pan} {formatPan(pan)}
						</span>
					</div>
					<div className="flex gap-1">
						<Button
							variant={track.muted ? "destructive" : "outline"}
							size="sm"
							className="h-6 flex-1"
							aria-label={
								track.muted ? m.timeline.unmuteTrack : m.timeline.muteTrack
							}
							onClick={() =>
								editor.timeline.toggleTrackMute({ trackId: track.id })
							}
						>
							<HugeiconsIcon
								icon={track.muted ? VolumeOffIcon : VolumeHighIcon}
								className="size-3.5"
							/>
						</Button>
						<Button
							variant="outline"
							size="sm"
							className={cn(
								"h-6 flex-1 text-[10px] font-bold",
								track.solo &&
									"border-yellow-400 bg-yellow-400 text-black hover:bg-yellow-300",
							)}
							aria-label={m.timeline.soloTrack}
							aria-pressed={track.solo === true}
							onClick={() =>
								editor.timeline.setTrackMix({
									trackId: track.id,
									solo: track.solo !== true,
								})
							}
						>
							S
						</Button>
					</div>
				</>
			}
		/>
	);
}

function MasterChannelStrip() {
	const m = useMessages();
	const editor = useEditor();
	const settings = useEditor((e) => e.project.getActiveOrNull()?.settings);
	const isMono = settings?.audioMono === true;

	return (
		<ChannelStrip
			name={m.timeline.masterBus}
			fader={
				<Fader
					value={settings?.masterVolume ?? 0}
					label={m.timeline.masterVolume}
					onPreview={(volumeDb) =>
						editor.audio.previewMasterVolume({ volumeDb })
					}
					onCommit={(masterVolume) =>
						editor.project.updateSettings({ settings: { masterVolume } })
					}
				/>
			}
			meter={
				<AudioLevelMeter
					channels={2}
					read={() => {
						const { left, right } = editor.audio.getMasterLevels();
						return [left, right];
					}}
				/>
			}
			footer={
				<>
					<LoudnessReadout />
					<Button
						variant="outline"
						size="sm"
						className="h-6 text-[10px]"
						aria-pressed={isMono}
						onClick={() =>
							editor.project.updateSettings({
								settings: { audioMono: !isMono },
							})
						}
					>
						{isMono ? m.timeline.mono : m.timeline.stereo}
					</Button>
				</>
			}
		/>
	);
}

/**
 * 트랙별 페이더·팬·음소거·솔로와 마스터 페이더·라우드니스·모노 전환.
 * 띄워 둔 채 클립을 편집하도록 바깥을 눌러도 닫히지 않고 단축키도 막지 않는다(공용 Popover를 쓰지 않는 이유).
 * 닫기 버튼이나 믹서 버튼으로 닫고, 머리 줄을 끌어 옮긴다
 */
export function AudioMixerButton() {
	const m = useMessages();
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const startMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		const header = event.currentTarget;
		header.setPointerCapture(event.pointerId);
		const start = { x: event.clientX - offset.x, y: event.clientY - offset.y };
		const onMove = (moveEvent: PointerEvent) =>
			setOffset({
				x: moveEvent.clientX - start.x,
				y: moveEvent.clientY - start.y,
			});
		const onEnd = () => {
			header.removeEventListener("pointermove", onMove);
			header.removeEventListener("pointerup", onEnd);
			header.removeEventListener("pointercancel", onEnd);
		};
		header.addEventListener("pointermove", onMove);
		header.addEventListener("pointerup", onEnd);
		header.addEventListener("pointercancel", onEnd);
	};
	const tracks = useEditor(
		(e) => e.scenes.getActiveSceneOrNull()?.tracks ?? [],
	);
	const audibleTracks = tracks.filter((track): track is AudibleTrack =>
		canTrackHaveAudio(track),
	);

	return (
		<PopoverPrimitive.Root modal={false}>
			<ActionTooltip label={m.timeline.audioMixer}>
				<PopoverTrigger asChild>
					<Button
						variant="text"
						size="icon"
						className="rounded-sm"
						aria-label={m.timeline.audioMixer}
					>
						<HugeiconsIcon icon={SlidersVerticalIcon} />
					</Button>
				</PopoverTrigger>
			</ActionTooltip>
			<PopoverContent
				align="end"
				className="w-auto max-w-[90vw] p-2 pt-0"
				style={{ translate: `${offset.x}px ${offset.y}px` }}
				onPointerDown={(event) => event.stopPropagation()}
				onInteractOutside={(event) => event.preventDefault()}
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<div
					className="flex cursor-move items-center justify-between py-1 pl-1 text-xs font-medium select-none"
					onPointerDown={startMove}
				>
					{m.timeline.audioMixer}
					<PopoverClose asChild>
						<Button
							variant="text"
							size="icon"
							className="size-6 rounded-sm"
							aria-label={m.dialogs.close}
						>
							<HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
						</Button>
					</PopoverClose>
				</div>
				<div className="flex gap-2 overflow-x-auto">
					{audibleTracks.length === 0 ? (
						<p className="text-muted-foreground self-center px-4 text-xs">
							{m.timeline.noAudioTracks}
						</p>
					) : (
						audibleTracks.map((track) => (
							<TrackChannelStrip
								key={track.id}
								track={track}
								isSilencedBySolo={isTrackSilencedBySolo({ track, tracks })}
							/>
						))
					)}
					<div className="bg-border w-px shrink-0" />
					<MasterChannelStrip />
				</div>
			</PopoverContent>
		</PopoverPrimitive.Root>
	);
}
