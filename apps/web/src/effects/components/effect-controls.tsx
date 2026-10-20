"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Cancel01Icon,
	FloppyDiskIcon,
	RefreshIcon,
} from "@hugeicons/core-free-icons";
import type { NumberParamDefinition, ParamValues } from "@/params";
import { buildDefaultParamValues } from "@/params/registry";
import type { EffectDefinition } from "@/effects/types";
import type { AdjustSlider } from "@/effects/definitions/adjust";
import { isSameParams, useEffectPresets } from "@/effects/effect-presets-store";
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
}: {
	definition: EffectDefinition;
	params: ParamValues;
	onPreview: PreviewParams;
	onCommit: () => void;
	onDiscard: () => void;
}) {
	const m = useMessages();
	const neutral = findNeutralParam(definition);
	const applyAll = (updates: ParamValues) => {
		onPreview(updates);
		onCommit();
	};

	return (
		<div className="flex flex-col gap-3 px-4 pt-1 pb-4">
			<UserPresetStrip
				effectType={definition.type}
				params={params}
				onSelect={applyAll}
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
					onClick={() => applyAll(buildDefaultParamValues(definition.params))}
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

export function UserPresetStrip({
	effectType,
	params,
	onSelect,
}: {
	effectType: string;
	params: ParamValues;
	onSelect: (params: ParamValues) => void;
}) {
	const m = useMessages();
	const allPresets = useEffectPresets((state) => state.presets);
	const remove = useEffectPresets((state) => state.remove);
	const presets = allPresets.filter((preset) => preset.effectType === effectType);
	if (presets.length === 0) return null;

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-muted-foreground text-xs">
				{m.properties.effectPresets.myPresets}
			</span>
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
				{presets.map((preset) => {
					const isActive = isSameParams({ params, preset: preset.params });
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
								onClick={() => onSelect(preset.params)}
								className="flex w-14 cursor-pointer flex-col gap-1 text-left"
							>
								<span
									className={cn(
										"block size-14 overflow-hidden rounded-md border-2",
										isActive ? "border-primary" : "border-transparent",
									)}
								>
									<EffectPreviewCanvas
										effectType={effectType}
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
