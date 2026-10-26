"use client";

import { useState } from "react";
import type { ParamValues } from "@/params";
import type { Effect } from "@/effects/types";
import type { EffectElement, VisualElement } from "@/timeline";
import {
	buildDefaultEffectInstance,
	effectsRegistry,
	getEffectSlot,
	type EffectSlot,
} from "@/effects";
import { generateUUID } from "@/utils/id";
import { useEditor } from "@/editor/use-editor";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Delete02Icon,
	ViewIcon,
	ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";
import { translateLabel, useMessages } from "@/i18n";
import { ADJUST_EFFECT_TYPE } from "@/effects/definitions/adjust";
import { AdjustControls } from "./adjust-controls";
import { EffectControls, EffectPicker } from "./effect-controls";

export function StandaloneEffectTab({
	element,
	trackId,
}: {
	element: EffectElement;
	trackId: string;
}) {
	const m = useMessages();
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});

	const effect: Effect = {
		id: element.id,
		type: element.effectType,
		params: element.params,
		enabled: true,
	};

	const previewParams = (updates: ParamValues) => {
		previewUpdates({
			params: { ...(renderElement as EffectElement).params, ...updates },
		});
	};

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>{m.properties.effect}</SectionTitle>
			</div>
			<EffectSection
				effect={effect}
				renderParams={(renderElement as EffectElement).params}
				previewParams={previewParams}
				onCommit={commit}
				onChangeEffect={({ effectType, params }) => {
					const current = effectsRegistry.get(element.effectType);
					const next = effectsRegistry.get(effectType);
					// 사용자가 붙인 이름은 두고, 효과 이름 그대로였을 때만 새 효과 이름으로 바꾼다
					const keepsDefaultName = [
						current.name,
						translateLabel({ messages: m, label: current.name }),
					].includes(element.name);
					previewUpdates({
						effectType,
						params,
						...(keepsDefaultName && {
							name: translateLabel({ messages: m, label: next.name }),
						}),
					});
					commit();
				}}
			/>
		</div>
	);
}

export function ClipEffectsTab({
	element,
	trackId,
}: {
	element: VisualElement;
	trackId: string;
}) {
	const editor = useEditor();
	const m = useMessages();
	const { renderElement, previewUpdates, commit } = useElementPreview({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	// 조정은 항상 보여 주고, 처음 값을 바꿀 때 이 id로 클립에 붙인다 (클립마다 새 id)
	const [draftAdjust, setDraftAdjust] = useState(() => ({
		elementId: element.id,
		id: generateUUID(),
	}));
	if (draftAdjust.elementId !== element.id) {
		setDraftAdjust({ elementId: element.id, id: generateUUID() });
	}

	const effects: Effect[] = element.effects ?? [];
	const renderEffects: Effect[] = (renderElement as VisualElement).effects ?? [];
	const findSlot = (slot: EffectSlot) =>
		effects.find((effect) => getEffectSlot({ effectType: effect.type }) === slot);
	const look = findSlot("effect");
	const adjust = findSlot("adjust");
	const adjustEffect: Effect = adjust ?? {
		...buildDefaultEffectInstance({ effectType: ADJUST_EFFECT_TYPE }),
		id: draftAdjust.id,
	};
	// 슬롯이 생기기 전에 여러 개 쌓아 둔 효과: 숨기지 않고 지울 수 있게 아래에 둔다
	const stacked = effects.filter(
		(effect) => effect !== look && effect !== adjust,
	);

	const getRenderParams = (effect: Effect): ParamValues =>
		renderEffects.find((existing) => existing.id === effect.id)?.params ??
		effect.params;

	const buildPreviewParams = (effect: Effect) => (updates: ParamValues) => {
		const exists = renderEffects.some((existing) => existing.id === effect.id);
		previewUpdates({
			effects: exists
				? renderEffects.map((existing) =>
						existing.id !== effect.id
							? existing
							: { ...existing, params: { ...existing.params, ...updates } },
					)
				: [
						...renderEffects,
						{ ...effect, params: { ...effect.params, ...updates } },
					],
		});
	};

	const changeEffect =
		(effect: Effect) =>
		({ effectType, params }: { effectType: string; params: ParamValues }) => {
			previewUpdates({
				effects: renderEffects.map((existing) =>
					existing.id === effect.id
						? { ...existing, type: effectType, params }
						: existing,
				),
			});
			commit();
		};

	const renderSection = ({
		effect,
		isAttached = true,
	}: {
		effect: Effect;
		isAttached?: boolean;
	}) => (
		<EffectSection
			key={effect.id}
			effect={effect}
			renderParams={getRenderParams(effect)}
			previewParams={buildPreviewParams(effect)}
			onCommit={commit}
			onChangeEffect={changeEffect(effect)}
			onToggle={
				isAttached
					? () =>
							editor.timeline.toggleClipEffect({
								trackId,
								elementId: element.id,
								effectId: effect.id,
							})
					: undefined
			}
			onRemove={
				isAttached
					? () =>
							editor.timeline.removeClipEffect({
								trackId,
								elementId: element.id,
								effectId: effect.id,
							})
					: undefined
			}
		/>
	);

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center">
				<SectionTitle>{m.properties.effects}</SectionTitle>
			</div>
			{look ? (
				renderSection({ effect: look })
			) : (
				<Section showTopBorder={false}>
					<SectionHeader>
						<SectionTitle>{m.properties.effect}</SectionTitle>
					</SectionHeader>
					<SectionContent className="p-0">
						<EffectPicker
							onPick={({ effectType, params }) =>
								editor.timeline.addClipEffect({
									trackId,
									elementId: element.id,
									effectType,
									params,
								})
							}
						/>
					</SectionContent>
				</Section>
			)}
			{renderSection({
				effect: adjustEffect,
				isAttached: adjust !== undefined,
			})}
			{stacked.map((effect) => renderSection({ effect }))}
		</div>
	);
}

function EffectSection({
	effect,
	renderParams,
	previewParams,
	onCommit,
	onToggle,
	onRemove,
	onChangeEffect,
}: {
	effect: Effect;
	renderParams: ParamValues;
	previewParams: (updates: ParamValues) => void;
	onCommit: () => void;
	onChangeEffect: (change: { effectType: string; params: ParamValues }) => void;
	onToggle?: () => void;
	onRemove?: () => void;
}) {
	const m = useMessages();
	const editor = useEditor();
	const definition = effectsRegistry.get(effect.type);
	const name = translateLabel({ messages: m, label: definition.name });

	return (
		<Section
			sectionKey={onToggle ? `clip-effect:${effect.id}` : undefined}
			showTopBorder={false}
		>
			<SectionHeader
				trailing={
					onToggle && (
						<div className="flex items-center gap-1">
							<Button
								variant={effect.enabled ? "secondary" : "ghost"}
								size="icon"
								aria-label={m.properties.toggleEffect({ name })}
								onClick={onToggle}
							>
								<HugeiconsIcon
									icon={effect.enabled ? ViewIcon : ViewOffSlashIcon}
								/>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.properties.removeEffect({ name })}
								onClick={onRemove}
							>
								<HugeiconsIcon icon={Delete02Icon} />
							</Button>
						</div>
					)
				}
			>
				<SectionTitle
					className={cn(onToggle && !effect.enabled && "text-muted-foreground")}
				>
					{name}
				</SectionTitle>
			</SectionHeader>
			<SectionContent
				className={cn("p-0", onToggle && !effect.enabled && "opacity-50")}
			>
				{effect.type === ADJUST_EFFECT_TYPE ? (
					<AdjustControls
						effectId={effect.id}
						params={renderParams}
						onPreview={previewParams}
						onCommit={onCommit}
						onDiscard={() => editor.timeline.discardPreview()}
					/>
				) : (
					<EffectControls
						definition={definition}
						params={renderParams}
						onPreview={previewParams}
						onCommit={onCommit}
						onDiscard={() => editor.timeline.discardPreview()}
						onChangeEffect={onChangeEffect}
					/>
				)}
			</SectionContent>
		</Section>
	);
}
