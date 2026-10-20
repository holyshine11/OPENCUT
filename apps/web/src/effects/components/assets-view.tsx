"use client";

import { useCallback, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { effectsRegistry, EFFECT_TARGET_ELEMENT_TYPES } from "@/effects";
import type { ParamValues } from "@/params";
import { EffectPreviewCanvas } from "./effect-preview-canvas";
import {
	ADJUST_PRESETS,
	buildAdjustPresetParams,
	type AdjustPreset,
} from "@/effects/definitions/adjust-presets";
import { useAdjustFavorites } from "@/effects/adjust-favorites-store";
import { AdjustFavoriteButton } from "./adjust-favorite-button";
import { useEditor } from "@/editor/use-editor";
import { buildEffectElement } from "@/timeline/element-utils";
import type { EffectCategory, EffectDefinition } from "@/effects/types";
import {
	useEffectPresets,
	type UserEffectPreset,
} from "@/effects/effect-presets-store";
import { cn } from "@/utils/ui";
import { ADJUST_EFFECT_TYPE } from "@/effects/definitions/adjust";
import { translateLabel, useMessages } from "@/i18n";

const CATEGORY_ORDER: EffectCategory[] = [
	"blur",
	"distort",
	"glitch",
	"stylize",
	"retro",
	"color",
];

type EffectFilter = "all" | "favorites" | "mine" | EffectCategory;

const favoriteId = (effectType: string) => `effect:${effectType}`;

export function EffectsView() {
	const m = useMessages();
	const [filter, setFilter] = useState<EffectFilter>("all");
	const favoriteIds = useAdjustFavorites((state) => state.favorites);
	const userPresets = useEffectPresets((state) => state.presets).filter(
		(preset) => preset.effectType !== ADJUST_EFFECT_TYPE,
	);
	const effects = effectsRegistry
		.getAll()
		.filter((effect) => effect.type !== ADJUST_EFFECT_TYPE);
	const favorites = favoriteIds.flatMap(
		(id) => effects.find((effect) => favoriteId(effect.type) === id) ?? [],
	);
	const filters: EffectFilter[] = [
		"all",
		...(favorites.length > 0 ? (["favorites"] as const) : []),
		...(userPresets.length > 0 ? (["mine"] as const) : []),
		...CATEGORY_ORDER,
	];
	const activeFilter = filters.includes(filter) ? filter : "all";
	const renderEffect = (effect: EffectDefinition) => (
		<EffectItem
			key={effect.type}
			effect={effect}
			overlay={<AdjustFavoriteButton presetId={favoriteId(effect.type)} />}
		/>
	);
	const visible =
		activeFilter === "all"
			? effects
			: effects.filter((effect) => effect.category === activeFilter);

	return (
		<PanelView title={m.assets.tabs.effects}>
			<p className="text-muted-foreground mb-3 text-xs text-balance">
				{m.assets.effectsHint}
			</p>
			<div className="mb-3 flex flex-wrap gap-1.5">
				{filters.map((id) => (
					<button
						key={id}
						type="button"
						aria-pressed={id === activeFilter}
						onClick={() => setFilter(id)}
						className={cn(
							"cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors",
							id === activeFilter
								? "bg-primary text-primary-foreground border-primary"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{m.assets.effectFilters[id]}
					</button>
				))}
			</div>
			{(activeFilter === "all" || activeFilter === "mine") &&
				userPresets.length > 0 && (
					<>
						<h3 className="text-muted-foreground mb-2 text-xs">
							{m.assets.effectFilters.mine}
						</h3>
						<EffectsGrid>
							{userPresets.map((preset) => (
								<UserPresetItem key={preset.id} preset={preset} />
							))}
						</EffectsGrid>
					</>
				)}
			{(activeFilter === "all" || activeFilter === "favorites") &&
				favorites.length > 0 && (
					<>
						<h3 className="text-muted-foreground mt-4 mb-2 text-xs first:mt-0">
							{m.assets.effectFilters.favorites}
						</h3>
						<EffectsGrid>{favorites.map(renderEffect)}</EffectsGrid>
					</>
				)}
			{activeFilter !== "mine" && activeFilter !== "favorites" && (
				<>
					{activeFilter === "all" &&
						(favorites.length > 0 || userPresets.length > 0) && (
							<h3 className="text-muted-foreground mt-4 mb-2 text-xs">
								{m.assets.effectFilters.all}
							</h3>
						)}
					<EffectsGrid>{visible.map(renderEffect)}</EffectsGrid>
				</>
			)}
		</PanelView>
	);
}

function UserPresetItem({ preset }: { preset: UserEffectPreset }) {
	const m = useMessages();
	const remove = useEffectPresets((state) => state.remove);
	return (
		<EffectItem
			itemId={`user-preset:${preset.id}`}
			effect={effectsRegistry.get(preset.effectType)}
			name={preset.name}
			params={preset.params}
			overlay={
				<button
					type="button"
					draggable={false}
					aria-label={m.properties.effectPresets.delete({ name: preset.name })}
					title={m.properties.effectPresets.delete({ name: preset.name })}
					className="absolute top-1 right-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white opacity-0 outline-hidden transition-opacity group-hover:opacity-100 hover:bg-black/60 focus-visible:opacity-100"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						remove({ id: preset.id });
					}}
				>
					<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
				</button>
			}
		/>
	);
}

export function AdjustmentView() {
	const m = useMessages();
	const definition = effectsRegistry.get(ADJUST_EFFECT_TYPE);
	const favoriteIds = useAdjustFavorites((state) => state.favorites);
	const favoritePresets = favoriteIds.flatMap(
		(id) => ADJUST_PRESETS.find((preset) => preset.id === id) ?? [],
	);
	const userPresets = useEffectPresets((state) => state.presets).filter(
		(preset) => preset.effectType === ADJUST_EFFECT_TYPE,
	);
	const renderPreset = (preset: AdjustPreset) => (
		<EffectItem
			key={preset.id}
			itemId={`${ADJUST_EFFECT_TYPE}:${preset.id}`}
			effect={definition}
			name={translateLabel({ messages: m, label: preset.name })}
			params={buildAdjustPresetParams(preset)}
			overlay={<AdjustFavoriteButton presetId={preset.id} />}
		/>
	);

	return (
		<PanelView title={m.assets.tabs.adjustment}>
			<p className="text-muted-foreground mb-3 text-xs text-balance">
				{m.assets.adjustmentHint}
			</p>
			<h3 className="text-muted-foreground mb-2 text-xs">
				{m.assets.adjustmentLayer}
			</h3>
			<EffectsGrid>
				<EffectItem
					effect={definition}
					name={m.assets.adjustmentCustom}
					params={buildAdjustPresetParams(null)}
				/>
			</EffectsGrid>
			{userPresets.length > 0 && (
				<>
					<h3 className="text-muted-foreground mt-4 mb-2 text-xs">
						{m.assets.effectFilters.mine}
					</h3>
					<EffectsGrid>
						{userPresets.map((preset) => (
							<UserPresetItem key={preset.id} preset={preset} />
						))}
					</EffectsGrid>
				</>
			)}
			{favoritePresets.length > 0 && (
				<>
					<h3 className="text-muted-foreground mt-4 mb-2 text-xs">
						{m.assets.adjustmentFavorites}
					</h3>
					<EffectsGrid>{favoritePresets.map(renderPreset)}</EffectsGrid>
				</>
			)}
			<h3 className="text-muted-foreground mt-4 mb-2 text-xs">
				{m.assets.adjustmentPresets}
			</h3>
			<EffectsGrid>{ADJUST_PRESETS.map(renderPreset)}</EffectsGrid>
		</PanelView>
	);
}

function EffectsGrid({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="grid gap-2"
			style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
		>
			{children}
		</div>
	);
}

function EffectItem({
	effect,
	itemId = effect.type,
	name,
	params,
	overlay,
}: {
	effect: EffectDefinition;
	overlay?: React.ReactNode;
	itemId?: string;
	name?: string;
	params?: ParamValues;
}) {
	const editor = useEditor();
	const m = useMessages();
	const displayName =
		name ?? translateLabel({ messages: m, label: effect.name });

	const handleAddToTimeline = useCallback(() => {
		const currentTime = editor.playback.getCurrentTime();
		const element = buildEffectElement({
			effectType: effect.type,
			startTime: currentTime,
			params,
			name: displayName,
		});

		editor.timeline.insertElement({
			placement: { mode: "auto", trackType: "effect" },
			element,
		});
	}, [editor, effect.type, params, displayName]);

	const preview = (
		<>
			<EffectPreviewCanvas effectType={effect.type} params={params} />
			{overlay}
		</>
	);

	return (
		<DraggableItem
			name={displayName}
			preview={preview}
			dragData={{
				id: itemId,
				name: displayName,
				type: "effect",
				effectType: effect.type,
				targetElementTypes: EFFECT_TARGET_ELEMENT_TYPES,
				params,
			}}
			onAddToTimeline={handleAddToTimeline}
			aspectRatio={1}
			isRounded
			variant="card"
			containerClassName="w-full"
		/>
	);
}
