"use client";

import { useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { UnavailableIcon } from "@hugeicons/core-free-icons";
import type { EditorCore } from "@/core";
import { useEditor } from "@/editor/use-editor";
import { useMessages } from "@/i18n";
import { SectionTitle } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdjustFavorites } from "@/effects/adjust-favorites-store";
import { AdjustFavoriteButton } from "@/effects/components/adjust-favorite-button";
import { listSubtitleGroups } from "@/subtitles/groups";
import { excludeLockedElements } from "@/timeline/track-capabilities";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { DEFAULTS } from "@/timeline/defaults";
import type { TextElement } from "@/timeline/types";
import { formatNumberForDisplay } from "@/utils/math";
import { cn } from "@/utils/ui";
import {
	mediaTimeFromSeconds,
	TICKS_PER_SECOND,
	textAnimationEffectiveDurations,
	textAnimationPresets,
	textAnimationSliderRange,
	type TextAnimation,
} from "@/wasm";
import {
	isPositive,
	sharedTextAnimation,
	type TextAnimationSlot,
	textAnimationPreviewRange,
	withLoopPreset,
	withRevealDuration,
	withRevealPreset,
} from "../text-animation";
import { TextAnimationThumbnail } from "./text-animation-thumbnail";

const SLOTS: TextAnimationSlot[] = ["in", "out", "loop"];
const DURATION_STEP_SECONDS = 0.05;
const DURATION_FRACTION_DIGITS = 2;
const PRESETS = textAnimationPresets();
const FILTERS = ["all", "favorites"] as const;
type PresetFilter = (typeof FILTERS)[number];

/** 즐겨찾기는 조정 프리셋 저장소를 같이 쓰고 접두어로 구분한다. 인과 아웃은 같은 프리셋을 공유한다 */
const favoriteId = (type: string) => `text-animation:${type}`;

let stopRangePreview: (() => void) | null = null;

/** 클립의 한 구간만 재생하고 끝에서 멈춘다. 사용자가 멈추거나 플레이헤드를 옮기면 그만둔다 */
function playTimeRange({
	editor,
	start,
	end,
}: {
	editor: EditorCore;
	start: number;
	end: number;
}) {
	stopRangePreview?.();
	const { playback } = editor;
	playback.seek({ time: mediaTimeFromSeconds({ seconds: start }) });
	playback.play();
	const endTime = mediaTimeFromSeconds({ seconds: end });
	const stop = () => {
		offUpdate();
		offSeek();
		offState();
		if (stopRangePreview === stop) stopRangePreview = null;
	};
	const offUpdate = playback.onUpdate((time) => {
		if (time < endTime) return;
		stop();
		playback.pause();
	});
	const offSeek = playback.onSeek((time) => {
		stop();
		// 타임라인 반복 구간 끝에서 되감긴 것이면 미리보기 구간을 넘긴 것이라 여기서 멈춘다
		const loop = playback.getLoop();
		if (loop?.enabled && time === loop.start) playback.pause();
	});
	const offState = playback.subscribe(() => {
		if (!playback.getIsPlaying()) stop();
	});
	stopRangePreview = stop;
}

/** CapCut 텍스트 > 애니메이션: 인/아웃/반복 중 하나를 골라 프리셋과 길이(주기)를 정한다 */
export function TextAnimationTab({
	element,
	trackId,
}: {
	element: TextElement;
	trackId: string;
}) {
	const m = useMessages();
	const editor = useEditor();
	const [slot, setSlot] = useState<TextAnimationSlot>("in");
	const { previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const [query, setQuery] = useState("");
	const [chosenFilter, setFilter] = useState<PresetFilter>("all");
	const favoriteIds = useAdjustFavorites((state) => state.favorites);
	const scene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const subtitleEntries = useMemo(() => {
		if (!scene || !element.subtitleGroupId) return [];
		const entries =
			listSubtitleGroups({ tracks: scene.tracks }).find(
				(group) => group.groupId === element.subtitleGroupId,
			)?.entries ?? [];
		// 잠긴 트랙의 자막은 건드리지 않는다
		return excludeLockedElements({ tracks: scene.tracks, elements: entries });
	}, [scene, element.subtitleGroupId]);

	const animation = element.textAnimation;
	const clipSeconds = element.duration / TICKS_PER_SECOND;
	const slotPresets = slot === "loop" ? PRESETS.loop : PRESETS.reveal;
	const activeType = animation?.[slot]?.type ?? null;
	const label = (type: string) => m.properties.textAnimation.presets[type] ?? type;
	const favorites = slotPresets.filter((type) => favoriteIds.includes(favoriteId(type)));
	// 마지막 즐겨찾기를 빼면 즐겨찾기 칩이 사라지므로 모두로 돌아간다
	const filter = favorites.length > 0 ? chosenFilter : "all";
	const needle = query.trim().toLocaleLowerCase();
	const presets = (filter === "favorites" ? favorites : slotPresets).filter(
		(type) =>
			!needle ||
			label(type).toLocaleLowerCase().includes(needle) ||
			type.toLocaleLowerCase().includes(needle),
	);

	// 이 클립의 인/아웃/반복을 같은 자막 묶음의 모든 클립에 실행 취소 한 번으로 넣는다
	const applyToSubtitles = () => {
		const shared = sharedTextAnimation(animation);
		editor.timeline.updateElements({
			updates: subtitleEntries.map((entry) => ({
				trackId: entry.trackId,
				elementId: entry.element.id,
				patch: {
					textAnimation: entry.element.id === element.id ? animation : shared,
				},
			})),
		});
	};

	// 프리뷰 오버레이는 undefined 패치를 변경으로 보지 않아 슬롯을 모두 지울 때 무시된다. 바로 명령 하나로 넣는다
	const apply = (next: TextAnimation | undefined) =>
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch: { textAnimation: next } }],
		});

	const pick = (type: string | null) => {
		if (type === activeType) return;
		const next =
			slot === "loop"
				? withLoopPreset({ animation, type })
				: withRevealPreset({ animation, side: slot, type });
		apply(next);
		if (!next || type === null) return;
		const range = textAnimationPreviewRange({ animation: next, slot, clipSeconds });
		const clipStart = element.startTime / TICKS_PER_SECOND;
		playTimeRange({
			editor,
			start: clipStart + range.startSeconds,
			end: clipStart + range.endSeconds,
		});
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex h-11 shrink-0 items-center border-b px-3.5">
				<SectionTitle>{m.properties.tabs.animation}</SectionTitle>
			</div>
			<div className="flex flex-col gap-4 px-4 py-3">
				<ToggleGroup
					type="single"
					size="sm"
					variant="outline"
					value={slot}
					onValueChange={(value) => {
						const next = SLOTS.find((option) => option === value);
						if (next) setSlot(next);
					}}
				>
					{SLOTS.map((option) => (
						<ToggleGroupItem key={option} value={option} className="flex-1 gap-1.5 text-xs">
							{m.properties.textAnimation[option]}
							{animation?.[option] && (
								<span aria-hidden className="bg-primary size-1.5 rounded-full" />
							)}
						</ToggleGroupItem>
					))}
				</ToggleGroup>

				<Input
					size="sm"
					variant="default"
					placeholder={m.properties.textAnimation.search}
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					showClearIcon
					onClear={() => setQuery("")}
					className="w-full"
					containerClassName="w-full"
				/>
				{favorites.length > 0 && (
					<div className="flex gap-1.5">
						{FILTERS.map((id) => (
							<button
								key={id}
								type="button"
								aria-pressed={id === filter}
								onClick={() => setFilter(id)}
								className={cn(
									"cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors",
									id === filter
										? "bg-primary text-primary-foreground border-primary"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{m.properties.textAnimation.filters[id]}
							</button>
						))}
					</div>
				)}

				<div className="grid grid-cols-4 gap-2">
					<PresetTile
						label={m.properties.textAnimation.none}
						isActive={activeType === null}
						onSelect={() => pick(null)}
					>
						{() => <HugeiconsIcon icon={UnavailableIcon} className="size-6" />}
					</PresetTile>
					{presets.map((type) => (
						<PresetTile
							key={type}
							label={label(type)}
							isActive={type === activeType}
							onSelect={() => pick(type)}
							overlay={<AdjustFavoriteButton presetId={favoriteId(type)} />}
						>
							{(isPlaying) => (
								<TextAnimationThumbnail
									slot={slot}
									type={type}
									content={m.properties.textAnimation.sample}
									fontFamily={
										typeof element.params.fontFamily === "string"
											? element.params.fontFamily
											: String(DEFAULTS.text.element.params.fontFamily)
									}
									isPlaying={isPlaying}
									isActive={type === activeType}
								/>
							)}
						</PresetTile>
					))}
				</div>
				{presets.length === 0 && (
					<p className="text-muted-foreground text-center text-xs">
						{m.properties.textAnimation.noResults}
					</p>
				)}

				{subtitleEntries.length > 1 && (
					<Button variant="outline" size="sm" onClick={applyToSubtitles}>
						{m.properties.textAnimation.applyToSubtitles({ count: subtitleEntries.length })}
					</Button>
				)}

				{animation && slot !== "loop" && animation[slot] && (
					<DurationSlider
						key={`${element.id}:${slot}`}
						label={m.properties.textAnimation.duration}
						animation={animation}
						side={slot}
						clipSeconds={clipSeconds}
						onPreview={(next) => previewUpdates({ textAnimation: next })}
						onCommit={commit}
					/>
				)}
				{animation?.loop && slot === "loop" && (
					<SecondsSlider
						key={`${element.id}:loop`}
						label={m.properties.textAnimation.period}
						value={
							isPositive(animation.loop.period)
								? animation.loop.period
								: DEFAULTS.text.animation.loopPeriod
						}
						min={DEFAULTS.text.animation.minLoopPeriod}
						max={DEFAULTS.text.animation.maxLoopPeriod}
						onChange={(period) => {
							previewUpdates({
								textAnimation: { ...animation, loop: { ...animation.loop!, period } },
							});
						}}
						onCommit={(period) => {
							previewUpdates({
								textAnimation: { ...animation, loop: { ...animation.loop!, period } },
							});
							commit();
						}}
						onReset={() => {
							apply({
								...animation,
								loop: { ...animation.loop!, period: DEFAULTS.text.animation.loopPeriod },
							});
						}}
					/>
				)}
			</div>
		</div>
	);
}

function DurationSlider({
	label,
	animation,
	side,
	clipSeconds,
	onPreview,
	onCommit,
}: {
	label: string;
	animation: TextAnimation;
	side: "in" | "out";
	clipSeconds: number;
	onPreview: (next: TextAnimation) => void;
	onCommit: () => void;
}) {
	const effective = textAnimationEffectiveDurations({ animation, clipSeconds });
	const current = side === "in" ? effective.inSeconds : effective.outSeconds;
	const other = side === "in" ? effective.outSeconds : effective.inSeconds;
	const range = textAnimationSliderRange({
		clipSeconds,
		otherSeconds: other,
		currentSeconds: current,
	});
	const withSeconds = (seconds: number) =>
		withRevealDuration({ animation, side, seconds, clipSeconds });

	return (
		<SecondsSlider
			label={label}
			value={current}
			min={range.min}
			max={range.max}
			disabled={!range.enabled}
			onChange={(seconds) => onPreview(withSeconds(seconds))}
			onCommit={(seconds) => {
				onPreview(withSeconds(seconds));
				onCommit();
			}}
			onReset={() => {
				const seconds = Math.min(
					range.max,
					Math.max(range.min, DEFAULTS.text.animation.duration),
				);
				onPreview(withSeconds(seconds));
				onCommit();
			}}
		/>
	);
}

function SecondsSlider({
	label,
	value,
	min,
	max,
	disabled,
	onChange,
	onCommit,
	onReset,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	disabled?: boolean;
	onChange: (value: number) => void;
	/** 마지막 값을 받는다. 키보드 입력에서 Radix는 onValueCommit을 onValueChange보다 먼저 부른다 */
	onCommit: (value: number) => void;
	onReset: () => void;
}) {
	const m = useMessages();
	const editor = useEditor();
	// 미리보기 값은 다음 렌더에야 돌아오므로 끄는 동안에는 이 값을 보여 준다
	const [slidingValue, setSlidingValue] = useState<number | null>(null);
	// 키보드 커밋 직후 같은 값으로 오는 onValueChange가 커밋되지 않은 프리뷰를 다시 남기지 않게 한다
	const committedRef = useRef<number | null>(null);
	// 시작값으로 되돌려 놓거나 포인터가 취소되면 Radix가 커밋을 부르지 않는다.
	// 커밋 뒤(같은 이벤트 안)에 남은 임시 값과 프리뷰를 치운다
	const clearDrag = () =>
		queueMicrotask(() => {
			setSlidingValue(null);
			editor.timeline.discardPreview();
		});
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between text-xs">
				<span className="text-muted-foreground">{label}</span>
				<span className="tabular-nums">
					{m.properties.textAnimation.seconds({
						value: formatNumberForDisplay({
							value: slidingValue ?? value,
							maxFractionDigits: DURATION_FRACTION_DIGITS,
						}),
					})}
				</span>
			</div>
			<Slider
				aria-label={label}
				min={min}
				max={max}
				step={DURATION_STEP_SECONDS}
				value={[slidingValue ?? value]}
				disabled={disabled}
				onValueChange={([next]) => {
					if (next === committedRef.current) return;
					setSlidingValue(next);
					onChange(next);
				}}
				onValueCommit={([next]) => {
					// 키보드에서는 같은 호출 안에서 onValueChange가 바로 뒤따른다. 그 순간만 막고 풀어 둔다
					committedRef.current = next;
					queueMicrotask(() => {
						committedRef.current = null;
					});
					setSlidingValue(null);
					onCommit(next);
				}}
				onPointerUp={clearDrag}
				onPointerCancel={clearDrag}
				onReset={
					disabled
						? undefined
						: () => {
								setSlidingValue(null);
								onReset();
							}
				}
			/>
		</div>
	);
}

function PresetTile({
	label,
	isActive,
	onSelect,
	overlay,
	children,
}: {
	label: string;
	isActive: boolean;
	onSelect: () => void;
	/** 칸 위에 얹는 버튼(즐겨찾기). 버튼 안에 버튼을 둘 수 없어 바깥에 겹친다 */
	overlay?: React.ReactNode;
	children: (isPlaying: boolean) => React.ReactNode;
}) {
	// 포인터와 키보드 포커스는 따로 들어오고 나간다. 둘 중 하나라도 있으면 재생한다
	const [isHovered, setIsHovered] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	return (
		<div
			className="group relative min-w-0"
			onPointerEnter={() => setIsHovered(true)}
			onPointerLeave={() => setIsHovered(false)}
		>
			{overlay}
			<button
				type="button"
				title={label}
				aria-pressed={isActive}
				onClick={onSelect}
				onFocus={() => setIsFocused(true)}
				onBlur={() => setIsFocused(false)}
				className="flex w-full min-w-0 cursor-pointer flex-col gap-1 text-left"
			>
				<span
					className={cn(
						"bg-accent text-muted-foreground flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border-2",
						isActive ? "border-primary text-foreground" : "border-transparent",
					)}
				>
					{children(isHovered || isFocused)}
				</span>
				<span
					className={cn(
						"truncate text-[11px]",
						isActive ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{label}
				</span>
			</button>
		</div>
	);
}
