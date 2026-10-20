"use client";

import { useEditor } from "@/editor/use-editor";
import { useMessages } from "@/i18n";
import { useShortcutLabel } from "@/actions/use-keyboard-shortcuts-help";
import type { ElementParamDefinition } from "@/params/registry";
import {
	type AudioCapableElement,
	findAdjacentAudioClip,
	getElementFades,
} from "@/timeline/audio-state";
import { TICKS_PER_SECOND } from "@/wasm";
import { ElementParamsTab } from "./element-params-tab";

const FADE_PARAM_KEYS = [
	"fadeIn",
	"fadeInCurve",
	"fadeOut",
	"fadeOutCurve",
	"crossfade",
] as const;

/** 페이드 인·아웃 길이와 곡선, 다음 클립과의 크로스페이드. 길이 범위는 클립 길이에 맞춘다 */
export function FadeTab({
	element,
	trackId,
}: {
	element: AudioCapableElement;
	trackId: string;
}) {
	const m = useMessages();
	const shortcut = useShortcutLabel({ action: "toggle-crossfade-selected" });
	const next = useEditor((editor) => {
		const track = editor.timeline.getTrackById({ trackId });
		return track
			? findAdjacentAudioClip({
					elements: track.elements,
					element,
					side: "after",
				})
			: null;
	});
	const durationSeconds = element.duration / TICKS_PER_SECOND;
	const { fadeIn, fadeOut } = getElementFades({ element });

	const withMax = ({
		param,
		max,
	}: {
		param: ElementParamDefinition;
		max: number;
	}) =>
		param.type === "number"
			? { ...param, max: Math.max(0, max), slider: true }
			: param;

	const resolveParam = (
		param: ElementParamDefinition,
	): ElementParamDefinition | null => {
		switch (param.key) {
			case "fadeIn":
				return withMax({ param, max: durationSeconds - fadeOut });
			case "fadeOut":
				return withMax({ param, max: durationSeconds - fadeIn });
			case "crossfade":
				return next
					? withMax({
							param,
							max: Math.min(durationSeconds, next.duration / TICKS_PER_SECOND),
						})
					: null;
			default:
				return param;
		}
	};

	return (
		<>
			<ElementParamsTab
				element={element}
				trackId={trackId}
				paramKeys={FADE_PARAM_KEYS}
				sectionKey="fade"
				resolveParam={resolveParam}
			/>
			<p className="text-muted-foreground px-4 pb-4 text-xs">
				{m.properties.crossfadeHint({ shortcut: shortcut ?? "-" })}
			</p>
		</>
	);
}
