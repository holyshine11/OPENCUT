"use client";

import { useCallback } from "react";
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
import type { EffectDefinition } from "@/effects/types";
import { ADJUST_EFFECT_TYPE } from "@/effects/definitions/adjust";
import { translateLabel, useMessages } from "@/i18n";

export function EffectsView() {
	const m = useMessages();
	const effects = effectsRegistry
		.getAll()
		.filter((effect) => effect.type !== ADJUST_EFFECT_TYPE);

	return (
		<PanelView title={m.assets.tabs.effects}>
			<EffectsGrid>
				{effects.map((effect) => (
					<EffectItem key={effect.type} effect={effect} />
				))}
			</EffectsGrid>
		</PanelView>
	);
}

export function AdjustmentView() {
	const m = useMessages();
	const definition = effectsRegistry.get(ADJUST_EFFECT_TYPE);
	const favoriteIds = useAdjustFavorites((state) => state.favorites);
	const favoritePresets = favoriteIds.flatMap(
		(id) => ADJUST_PRESETS.find((preset) => preset.id === id) ?? [],
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
