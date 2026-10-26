"use client";

import { useState } from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { withResetClick } from "@/components/ui/slider";
import { HugeiconsIcon } from "@hugeicons/react";
import { ImageCompositionIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import type { ParamValues } from "@/params";
import {
	ADJUST_EFFECT_TYPE,
	ADJUST_SECTIONS,
	ADJUST_SLIDERS,
	ADJUST_SLIDERS_BY_KEY,
	type AdjustSlider,
	type AdjustSectionId,
	isNeutralAdjust,
} from "@/effects/definitions/adjust";
import {
	ADJUST_PRESETS,
	buildAdjustPresetParams,
	findMatchingAdjustPreset,
	getAdjustPresetParams,
} from "@/effects/definitions/adjust-presets";
import { EffectPreviewCanvas } from "./effect-preview-canvas";
import {
	NoneTile,
	SavePresetButton,
	UserPresetStrip,
} from "./effect-controls";
import { AdjustFavoriteButton } from "./adjust-favorite-button";
import { useAdjustFavorites } from "@/effects/adjust-favorites-store";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";
import { cn } from "@/utils/ui";
import { translateLabel, useMessages } from "@/i18n";

type PreviewParams = (updates: ParamValues) => void;

const TRACK_BACKGROUNDS: Record<NonNullable<AdjustSlider["track"]>, string> = {
	hue: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
	temperature: "linear-gradient(to right, #3b82f6, #d4d4d8, #f59e0b)",
	tint: "linear-gradient(to right, #22c55e, #d4d4d8, #d946ef)",
};

function readValue({
	params,
	slider,
}: {
	params: ParamValues;
	slider: AdjustSlider;
}): number {
	const value = Number(params[slider.key]);
	return Number.isFinite(value) ? value : slider.default;
}

export function AdjustControls({
	effectId,
	params,
	onPreview,
	onCommit,
	onDiscard,
}: {
	effectId: string;
	params: ParamValues;
	onPreview: PreviewParams;
	onCommit: () => void;
	onDiscard: () => void;
}) {
	const m = useMessages();
	const amount = ADJUST_SLIDERS_BY_KEY.amount;
	const activePreset = findMatchingAdjustPreset(params);

	const applyAll = (updates: ParamValues) => {
		onPreview(updates);
		onCommit();
	};

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-3 px-4 pt-1 pb-3">
				<UserPresetStrip
					effectType={ADJUST_EFFECT_TYPE}
					activeType={ADJUST_EFFECT_TYPE}
					params={params}
					onSelect={(preset) => applyAll(preset.params)}
				/>
				<PresetStrip
					isNone={isNeutralAdjust(params)}
					onSelectNone={() => applyAll(buildAdjustPresetParams(null))}
					activePresetId={activePreset?.id ?? null}
					onSelect={(preset) =>
						applyAll({
							...buildAdjustPresetParams(preset),
							amount: readValue({ params, slider: amount }),
						})
					}
				/>
				<SliderRow
					slider={amount}
					value={readValue({ params, slider: amount })}
					onPreview={onPreview}
					onCommit={onCommit}
				/>
				<div className="flex gap-2">
					<CompareButton
						onHoldStart={() => onPreview({ amount: 0 })}
						onHoldEnd={onDiscard}
					/>
					<Button
						variant="outline"
						size="sm"
						className="flex-1"
						onClick={() => applyAll(buildAdjustPresetParams(null))}
					>
						<HugeiconsIcon icon={RefreshIcon} />
						{m.properties.adjust.resetAll}
					</Button>
				</div>
				<SavePresetButton
					effectType={ADJUST_EFFECT_TYPE}
					defaultName={m.assets.adjustmentLayer}
					params={params}
				/>
			</div>
			{ADJUST_SECTIONS.map((section) => (
				<AdjustSection
					key={section.id}
					effectId={effectId}
					sectionId={section.id}
					label={section.label}
					defaultOpen={section.defaultOpen}
					params={params}
					onPreview={onPreview}
					onCommit={onCommit}
				/>
			))}
		</div>
	);
}

function PresetStrip({
	isNone,
	onSelectNone,
	activePresetId,
	onSelect,
}: {
	isNone: boolean;
	onSelectNone: () => void;
	activePresetId: string | null;
	onSelect: (preset: (typeof ADJUST_PRESETS)[number]) => void;
}) {
	const m = useMessages();
	const favorites = useAdjustFavorites((state) => state.favorites);
	// 즐겨찾기를 누른 순서대로 앞에 두고, 나머지는 원래 순서를 지킨다
	const presets = [
		...favorites.flatMap(
			(id) => ADJUST_PRESETS.find((preset) => preset.id === id) ?? [],
		),
		...ADJUST_PRESETS.filter((preset) => !favorites.includes(preset.id)),
	];
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-muted-foreground text-xs">
				{m.properties.adjust.presets}
			</span>
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
				<NoneTile isActive={isNone} onSelect={onSelectNone} />
				{presets.map((preset) => {
					const name = translateLabel({ messages: m, label: preset.name });
					const isActive = preset.id === activePresetId;
					return (
						<div key={preset.id} className="group relative w-14 shrink-0">
							<AdjustFavoriteButton presetId={preset.id} />
							<button
								type="button"
								title={name}
								aria-pressed={isActive}
								onClick={() => onSelect(preset)}
								className="flex w-14 cursor-pointer flex-col gap-1 text-left"
							>
								<span
									className={cn(
										"block size-14 overflow-hidden rounded-md border-2",
										isActive ? "border-primary" : "border-transparent",
									)}
								>
									<EffectPreviewCanvas
										effectType={ADJUST_EFFECT_TYPE}
										params={getAdjustPresetParams(preset)}
									/>
								</span>
								<span
									className={cn(
										"truncate text-[11px]",
										isActive ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{name}
								</span>
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function CompareButton({
	onHoldStart,
	onHoldEnd,
}: {
	onHoldStart: () => void;
	onHoldEnd: () => void;
}) {
	const m = useMessages();
	const [isHolding, setIsHolding] = useState(false);
	const start = () => {
		if (isHolding) return;
		setIsHolding(true);
		onHoldStart();
	};
	const end = () => {
		if (!isHolding) return;
		setIsHolding(false);
		onHoldEnd();
	};

	return (
		<Button
			variant={isHolding ? "secondary" : "outline"}
			size="sm"
			className="flex-1"
			title={m.properties.adjust.compare}
			aria-label={m.properties.adjust.compare}
			aria-pressed={isHolding}
			onPointerDown={start}
			onPointerUp={end}
			onPointerLeave={end}
			onKeyDown={(event) => {
				if (event.key === " " || event.key === "Enter") start();
			}}
			onKeyUp={end}
			onBlur={end}
		>
			<HugeiconsIcon icon={ImageCompositionIcon} />
			{translateLabel({ messages: m, label: "Before" })}
		</Button>
	);
}

function AdjustSection({
	effectId,
	sectionId,
	label,
	defaultOpen,
	params,
	onPreview,
	onCommit,
}: {
	effectId: string;
	sectionId: AdjustSectionId;
	label: string;
	defaultOpen: boolean;
	params: ParamValues;
	onPreview: PreviewParams;
	onCommit: () => void;
}) {
	const m = useMessages();
	const name = translateLabel({ messages: m, label });
	const sliders = ADJUST_SLIDERS.filter(
		(slider) => slider.section === sectionId,
	);
	const changedCount = sliders.filter(
		(slider) => !slider.hue && readValue({ params, slider }) !== slider.default,
	).length;

	const reset = () => {
		onPreview(
			Object.fromEntries(sliders.map((slider) => [slider.key, slider.default])),
		);
		onCommit();
	};

	return (
		<Section
			collapsible
			defaultOpen={defaultOpen}
			sectionKey={`adjust:${effectId}:${sectionId}`}
		>
			<SectionHeader
				trailing={
					changedCount > 0 && (
						<Button
							variant="ghost"
							size="icon"
							aria-label={m.properties.adjust.resetSection({ name })}
							title={m.properties.adjust.resetSection({ name })}
							onClick={reset}
						>
							<HugeiconsIcon icon={RefreshIcon} />
						</Button>
					)
				}
			>
				<SectionTitle>
					{name}
					{changedCount > 0 && (
						<span className="bg-primary ml-2 inline-block size-1.5 rounded-full align-middle" />
					)}
				</SectionTitle>
			</SectionHeader>
			<SectionContent className="flex flex-col gap-3 px-4 pt-0 pb-4">
				{sliders.map((slider) => (
					<SliderRow
						key={slider.key}
						slider={slider}
						value={readValue({ params, slider })}
						onPreview={onPreview}
						onCommit={onCommit}
					/>
				))}
			</SectionContent>
		</Section>
	);
}

export function SliderRow({
	slider,
	value,
	onPreview,
	onCommit,
}: {
	slider: AdjustSlider;
	value: number;
	onPreview: PreviewParams;
	onCommit: () => void;
}) {
	const m = useMessages();
	const label = translateLabel({ messages: m, label: slider.label });
	// 미리보기 값은 다음 렌더에야 돌아오므로 끄는 동안에는 이 값을 보여 준다
	const [slidingValue, setSlidingValue] = useState<number | null>(null);
	const [draft, setDraft] = useState<string | null>(null);
	const shown = slidingValue ?? value;
	const digits = getFractionDigitsForStep({ step: slider.step });
	const isBipolar = slider.min < 0 && !slider.track;
	const percent = ((shown - slider.min) / (slider.max - slider.min)) * 100;
	const zeroPercent = ((0 - slider.min) / (slider.max - slider.min)) * 100;

	const clamp = (next: number) =>
		Math.min(
			slider.max,
			Math.max(slider.min, snapToStep({ value: next, step: slider.step })),
		);

	const set = (next: number) => onPreview({ [slider.key]: clamp(next) });

	const reset = () => {
		onPreview({ [slider.key]: slider.default });
		onCommit();
	};

	const commitDraft = () => {
		if (draft === null) return;
		const parsed = Number.parseFloat(draft);
		setDraft(null);
		if (Number.isNaN(parsed)) return;
		set(parsed);
		onCommit();
	};

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between gap-2">
				<button
					type="button"
					className={cn(
						"cursor-default truncate text-left text-xs",
						shown === slider.default
							? "text-muted-foreground"
							: "text-foreground",
					)}
					title={m.properties.adjust.resetHint}
					onDoubleClick={reset}
				>
					{label}
				</button>
				<div className="flex items-center gap-1">
					{slider.hue && (
						<span
							className="size-3 rounded-full border"
							style={{ backgroundColor: `hsl(${shown} 90% 55%)` }}
						/>
					)}
					<input
						aria-label={label}
						inputMode="decimal"
						className="hover:bg-accent focus:bg-accent w-12 rounded-sm bg-transparent px-1 text-right text-xs tabular-nums outline-none"
						value={
							draft ??
							formatNumberForDisplay({
								value: shown,
								maxFractionDigits: digits,
							})
						}
						onFocus={(event) => event.currentTarget.select()}
						onChange={(event) => setDraft(event.target.value)}
						onBlur={commitDraft}
						onKeyDown={(event) => {
							if (event.key === "Enter") event.currentTarget.blur();
							if (event.key === "Escape") {
								setDraft(null);
								event.currentTarget.blur();
							}
							if (event.key === "ArrowUp" || event.key === "ArrowDown") {
								event.preventDefault();
								const direction = event.key === "ArrowUp" ? 1 : -1;
								const multiplier = event.shiftKey ? 10 : 1;
								setDraft(null);
								set(shown + direction * slider.step * multiplier);
								onCommit();
							}
						}}
					/>
				</div>
			</div>
			<SliderPrimitive.Root
				aria-label={label}
				className="relative flex h-4 w-full touch-none items-center select-none"
				min={slider.min}
				max={slider.max}
				step={slider.step}
				value={[shown]}
				onValueChange={([next]) => {
					setSlidingValue(next);
					set(next);
				}}
				onValueCommit={() => {
					setSlidingValue(null);
					onCommit();
				}}
				onPointerDown={withResetClick({ onReset: reset })}
				onDoubleClick={reset}
			>
				<SliderPrimitive.Track
					className="bg-accent relative h-1 w-full grow overflow-hidden rounded-full"
					style={
						slider.track
							? { background: TRACK_BACKGROUNDS[slider.track] }
							: undefined
					}
				>
					{!slider.track &&
						(isBipolar ? (
							<span
								className="bg-primary absolute h-full"
								style={{
									left: `${Math.min(percent, zeroPercent)}%`,
									width: `${Math.abs(percent - zeroPercent)}%`,
								}}
							/>
						) : (
							<SliderPrimitive.Range className="bg-primary absolute h-full" />
						))}
				</SliderPrimitive.Track>
				{isBipolar && (
					<span
						className="bg-muted-foreground/60 pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2"
						style={{ left: `${zeroPercent}%` }}
					/>
				)}
				<SliderPrimitive.Thumb className="border-primary/60 bg-background focus-visible:ring-ring block size-3.5 rounded-full border shadow-sm focus-visible:ring-1 focus-visible:outline-hidden" />
			</SliderPrimitive.Root>
		</div>
	);
}
