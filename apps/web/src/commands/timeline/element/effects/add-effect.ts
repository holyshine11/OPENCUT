import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import { isVisualElement, updateElementInSceneTracks } from "@/timeline";
import type { SceneTracks, VisualElement } from "@/timeline";
import { placeEffectInSlot } from "@/effects";
import type { Effect } from "@/effects/types";
import type { ParamValues } from "@/params";

function addEffectToElement({
	element,
	effectType,
	params,
}: {
	element: VisualElement;
	effectType: string;
	params?: ParamValues;
}): { element: VisualElement; effect: Effect } {
	const { effects, effect } = placeEffectInSlot({
		effects: element.effects ?? [],
		effectType,
		params,
	});
	return { element: { ...element, effects }, effect };
}

export class AddClipEffectCommand extends Command {
	private savedState: SceneTracks | null = null;
	private effectId: string | null = null;
	private readonly trackId: string;
	private readonly elementId: string;
	private readonly effectType: string;
	private readonly params?: ParamValues;

	constructor({
		trackId,
		elementId,
		effectType,
		params,
	}: {
		trackId: string;
		elementId: string;
		effectType: string;
		params?: ParamValues;
	}) {
		super();
		this.trackId = trackId;
		this.elementId = elementId;
		this.effectType = effectType;
		this.params = params;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;

		const updatedTracks = updateElementInSceneTracks({
			tracks: this.savedState,
			trackId: this.trackId,
			elementId: this.elementId,
			elementPredicate: isVisualElement,
			update: (element) => {
				if (!isVisualElement(element)) return element;
				const updated = addEffectToElement({
					element,
					effectType: this.effectType,
					params: this.params,
				});
				this.effectId = updated.effect.id;
				return updated.element;
			},
		});

		editor.timeline.updateTracks(updatedTracks);
		return undefined;
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}

	getEffectId(): string | null {
		return this.effectId;
	}
}
