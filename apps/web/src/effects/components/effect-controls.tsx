"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Cancel01Icon,
	FloppyDiskIcon,
	RefreshIcon,
	UnavailableIcon,
} from "@hugeicons/core-free-icons";
import type { NumberParamDefinition, ParamValues } from "@/params";
import { buildDefaultParamValues } from "@/params/registry";
import type { EffectDefinition } from "@/effects/types";
import type { AdjustSlider } from "@/effects/definitions/adjust";
import {
	isSameParams,
	useEffectPresets,
	type UserEffectPreset,
} from "@/effects/effect-presets-store";
import { useAdjustFavorites } from "@/effects/adjust-favorites-store";
import { effectsRegistry } from "@/effects";
import { ADJUST_EFFECT_TYPE } from "@/effects/definitions/adjust";
import { AdjustFavoriteButton } from "./adjust-favorite-button";
import { EffectPreviewCanvas } from "./effect-preview-canvas";
import { CompareButton, SliderRow } from "./adjust-controls";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/utils/ui";
import { translateLabel, useMessages } from "@/i18n";

type PreviewParams = (updates: ParamValues) => void;

function toSlider(param: NumberParamDefinition): AdjustSlider {
	const isHue = /hue$/i.test(param.key);
	return {
		key: param.key,
		label: param.label,
		section: null,
		min: param.min ?? 0,
		max: param.max ?? 100,
		step: param.step,
		default: param.default,
		...(isHue && { hue: true, track: "hue" as const }),
	};
}

/** Param that turns the effect off at its minimum, used by hold-to-compare. */
function findNeutralParam(definition: EffectDefinition) {
	return (
		definition.params.find((param) => param.key === "mix") ??
		definition.params.find((param) => param.type === "number")
	);
}

export function EffectControls({
	definition,
	params,
	onPreview,
	onCommit,
	onDiscard,
	onChangeEffect,
}: {
	definition: EffectDefinition;
	params: ParamValues;
	onPreview: PreviewParams;
	onCommit: () => void;
	onDiscard: () => void;
	onChangeEffect: (change: { effectType: string; params: ParamValues }) => void;
}) {
	const m = useMessages();
	const neutral = findNeutralParam(definition);
	const isOff =
		neutral?.type === "number" &&
		Number(params[neutral.key] ?? neutral.default) === (neutral.min ?? 0);
	const applyAll = (updates: ParamValues) => {
		onPreview(updates);
		onCommit();
	};

	return (
		<div className="flex flex-col gap-3 px-4 pt-1 pb-4">
			<EffectStrip
				activeType={isOff ? null : definition.type}
				onSelectNone={
					neutral?.type === "number"
						? () => applyAll({ [neutral.key]: neutral.min ?? 0 })
						: undefined
				}
				onSelect={(next) => {
					if (next.type === definition.type) {
						// 없음에서 같은 효과를 다시 고르면 기본값으로 켠다
						if (isOff) applyAll(buildDefaultParamValues(next.params));
						return;
					}
					onChangeEffect({
						effectType: next.type,
						params: buildDefaultParamValues(next.params),
					});
				}}
			/>
			<UserPresetStrip
				activeType={definition.type}
				params={params}
				onSelect={(preset) =>
					preset.effectType === definition.type
						? applyAll(preset.params)
						: onChangeEffect(preset)
				}
			/>
			{definition.params.map((param) => {
				if (param.type === "number") {
					const slider = toSlider(param);
					const value = Number(params[param.key]);
					return (
						<SliderRow
							key={param.key}
							slider={slider}
							value={Number.isFinite(value) ? value : slider.default}
							onPreview={onPreview}
							onCommit={onCommit}
						/>
					);
				}
				if (param.type === "select") {
					return (
						<div key={param.key} className="flex flex-col gap-1.5">
							<span className="text-muted-foreground text-xs">
								{translateLabel({ messages: m, label: param.label })}
							</span>
							<ToggleGroup
								type="single"
								size="sm"
								variant="outline"
								className="justify-start"
								value={String(params[param.key] ?? param.default)}
								onValueChange={(value) => value && applyAll({ [param.key]: value })}
							>
								{param.options.map((option) => (
									<ToggleGroupItem
										key={option.value}
										value={option.value}
										className="flex-1 text-xs"
									>
										{translateLabel({ messages: m, label: option.label })}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
						</div>
					);
				}
				return null;
			})}
			<div className="flex gap-2">
				{neutral?.type === "number" && (
					<CompareButton
						onHoldStart={() => onPreview({ [neutral.key]: neutral.min ?? 0 })}
						onHoldEnd={onDiscard}
					/>
				)}
				<Button
					variant="outline"
					size="sm"
					className="flex-1"
					onClick={() =>
						// 초기화는 "없음"과 같다: 기본값으로 되돌리고 효과는 끈다
						applyAll({
							...buildDefaultParamValues(definition.params),
							...(neutral?.type === "number" && {
								[neutral.key]: neutral.min ?? 0,
							}),
						})
					}
				>
					<HugeiconsIcon icon={RefreshIcon} />
					{m.properties.adjust.resetAll}
				</Button>
			</div>
			<SavePresetButton
				effectType={definition.type}
				defaultName={translateLabel({ messages: m, label: definition.name })}
				params={params}
			/>
		</div>
	);
}

/** The clip's effect slot before anything is picked: only the choices, with "None" selected. */
export function EffectPicker({
	onPick,
}: {
	onPick: (change: { effectType: string; params: ParamValues }) => void;
}) {
	return (
		<div className="flex flex-col gap-3 px-4 pt-1 pb-4">
			<EffectStrip
				activeType={null}
				onSelectNone={() => {}}
				onSelect={(next) =>
					onPick({
						effectType: next.type,
						params: buildDefaultParamValues(next.params),
					})
				}
			/>
			<UserPresetStrip
				activeType=""
				params={{}}
				onSelect={({ effectType, params }) => onPick({ effectType, params })}
			/>
		</div>
	);
}

export const effectFavoriteId = (effectType: string) => `effect:${effectType}`;

/** Every effect as a thumbnail row, favorites first, like the adjustment presets. */
function EffectStrip({
	activeType,
	onSelect,
	onSelectNone,
}: {
	/** null when the effect is switched off, which highlights "None" */
	activeType: string | null;
	onSelect: (definition: EffectDefinition) => void;
	onSelectNone?: () => void;
}) {
	const m = useMessages();
	const favorites = useAdjustFavorites((state) => state.favorites);
	const effects = effectsRegistry
		.getAll()
		.filter((effect) => effect.type !== ADJUST_EFFECT_TYPE);
	const isFavorite = (effect: EffectDefinition) =>
		favorites.includes(effectFavoriteId(effect.type));
	const ordered = [
		...favorites.flatMap(
			(id) => effects.find((effect) => effectFavoriteId(effect.type) === id) ?? [],
		),
		...effects.filter((effect) => !isFavorite(effect)),
	];

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-muted-foreground text-xs">
				{m.properties.effectPresets.effects}
			</span>
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
				{onSelectNone && (
					<NoneTile isActive={activeType === null} onSelect={onSelectNone} />
				)}
				{ordered.map((effect) => {
					const name = translateLabel({ messages: m, label: effect.name });
					const isActive = effect.type === activeType;
					return (
						<div key={effect.type} className="group relative w-14 shrink-0">
							<AdjustFavoriteButton presetId={effectFavoriteId(effect.type)} />
							<button
								type="button"
								title={name}
								aria-pressed={isActive}
								onClick={() => onSelect(effect)}
								className="flex w-14 cursor-pointer flex-col gap-1 text-left"
							>
								<span
									className={cn(
										"block size-14 overflow-hidden rounded-md border-2",
										isActive ? "border-primary" : "border-transparent",
									)}
								>
									<EffectPreviewCanvas effectType={effect.type} />
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

/** First tile of a preset strip: the effect does nothing. */
export function NoneTile({
	isActive,
	onSelect,
}: {
	isActive: boolean;
	onSelect: () => void;
}) {
	const m = useMessages();
	return (
		<button
			type="button"
			title={m.properties.effectPresets.none}
			aria-pressed={isActive}
			onClick={onSelect}
			className="flex w-14 shrink-0 cursor-pointer flex-col gap-1 text-left"
		>
			<span
				className={cn(
					"bg-accent text-muted-foreground flex size-14 items-center justify-center rounded-md border-2",
					isActive ? "border-primary" : "border-transparent",
				)}
			>
				<HugeiconsIcon icon={UnavailableIcon} className="size-6" />
			</span>
			<span
				className={cn(
					"truncate text-[11px]",
					isActive ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{m.properties.effectPresets.none}
			</span>
		</button>
	);
}

/** Without effectType it lists every effect preset (all but adjustment). */
export function UserPresetStrip({
	effectType,
	activeType,
	params,
	onSelect,
}: {
	effectType?: string;
	activeType: string;
	params: ParamValues;
	onSelect: (preset: UserEffectPreset) => void;
}) {
	const m = useMessages();
	const allPresets = useEffectPresets((state) => state.presets);
	const remove = useEffectPresets((state) => state.remove);
	const presets = allPresets.filter((preset) =>
		effectType
			? preset.effectType === effectType
			: preset.effectType !== ADJUST_EFFECT_TYPE,
	);
	if (presets.length === 0) return null;

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-muted-foreground text-xs">
				{m.properties.effectPresets.myPresets}
			</span>
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
				{presets.map((preset) => {
					const isActive =
						preset.effectType === activeType &&
						isSameParams({ params, preset: preset.params });
					return (
						<div key={preset.id} className="group relative w-14 shrink-0">
							<button
								type="button"
								aria-label={m.properties.effectPresets.delete({
									name: preset.name,
								})}
								title={m.properties.effectPresets.delete({ name: preset.name })}
								className="absolute top-1 right-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white opacity-0 outline-hidden transition-opacity group-hover:opacity-100 hover:bg-black/60 focus-visible:opacity-100"
								onClick={() => remove({ id: preset.id })}
							>
								<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
							</button>
							<button
								type="button"
								title={preset.name}
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
										effectType={preset.effectType}
										params={preset.params}
									/>
								</span>
								<span
									className={cn(
										"truncate text-[11px]",
										isActive ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{preset.name}
								</span>
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function SavePresetButton({
	effectType,
	defaultName,
	params,
}: {
	effectType: string;
	defaultName: string;
	params: ParamValues;
}) {
	const m = useMessages();
	const add = useEffectPresets((state) => state.add);
	const count = useEffectPresets(
		(state) =>
			state.presets.filter((preset) => preset.effectType === effectType).length,
	);
	const [draft, setDraft] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const isEditing = draft !== null;

	// 저장 버튼을 누른 직후 바로 이름을 고칠 수 있게 한다
	useEffect(() => {
		if (isEditing) inputRef.current?.focus();
	}, [isEditing]);

	const save = () => {
		const name = draft?.trim() || `${defaultName} ${count + 1}`;
		add({ effectType, name, params: { ...params } });
		setDraft(null);
		toast.success(m.properties.effectPresets.saved({ name }));
	};

	if (draft === null) {
		return (
			<Button
				variant="secondary"
				size="sm"
				onClick={() => setDraft(`${defaultName} ${count + 1}`)}
			>
				<HugeiconsIcon icon={FloppyDiskIcon} />
				{m.properties.effectPresets.save}
			</Button>
		);
	}

	return (
		<form
			className="flex gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				save();
			}}
		>
			<input
				ref={inputRef}
				aria-label={m.properties.effectPresets.namePlaceholder}
				placeholder={m.properties.effectPresets.namePlaceholder}
				className="border-input focus-visible:ring-ring h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-xs outline-none focus-visible:ring-1"
				value={draft}
				onFocus={(event) => event.currentTarget.select()}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") setDraft(null);
				}}
			/>
			<Button type="submit" size="sm">
				{m.properties.effectPresets.confirm}
			</Button>
		</form>
	);
}
