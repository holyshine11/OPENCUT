"use client";

import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { useMessages } from "@/i18n";
import { DEFAULTS } from "@/timeline/defaults";
import { cn } from "@/utils/ui";
import {
	buildTransitionUpdates,
	TRANSITION_TYPES,
	type TransitionType,
} from "@/transitions";

// 썸네일 대신 쓰는 미리보기 그라디언트. 왼쪽이 앞 클립, 오른쪽이 뒤 클립
const SWATCH_CLASS: Record<TransitionType | "none", string> = {
	none: "bg-muted",
	dissolve: "bg-gradient-to-r from-sky-500 to-rose-500",
	fadeBlack: "bg-gradient-to-r from-sky-500 via-black to-rose-500",
	fadeWhite: "bg-gradient-to-r from-sky-500 via-white to-rose-500",
};

export function TransitionsView() {
	const m = useMessages();
	const editor = useEditor();
	const tracks = useEditor(
		(e) => e.scenes.getActiveSceneOrNull()?.tracks ?? [],
	);
	const selected = useEditor((e) => e.selection.getSelectedElements());

	const targets = buildTransitionUpdates({
		tracks,
		selected,
		transition: undefined,
	});
	const targetElement = targets[0]
		? tracks
				.find((track) => track.id === targets[0].trackId)
				?.elements.find((element) => element.id === targets[0].elementId)
		: undefined;
	const current =
		targetElement && "transition" in targetElement
			? (targetElement.transition?.type ?? "none")
			: "none";

	const apply = (type: TransitionType | "none") => {
		const previousDuration =
			targetElement && "transition" in targetElement
				? targetElement.transition?.duration
				: undefined;
		const updates = buildTransitionUpdates({
			tracks,
			selected,
			transition:
				type === "none"
					? undefined
					: {
							type,
							duration: previousDuration ?? DEFAULTS.element.transition,
						},
		});
		if (updates.length === 0) {
			toast.info(m.assets.noTransitionTarget);
			return;
		}
		editor.timeline.updateElements({ updates });
	};

	return (
		<PanelView title={m.assets.tabs.transitions}>
			<p className="text-muted-foreground mb-3 text-xs text-balance">
				{m.assets.transitionsHint}
			</p>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
				{(["none", ...TRANSITION_TYPES] as const).map((type) => (
					<button
						key={type}
						type="button"
						aria-pressed={targets.length > 0 && current === type}
						onClick={() => apply(type)}
						className="group flex cursor-pointer flex-col gap-1 text-left"
					>
						<span
							className={cn(
								"aspect-video w-full rounded-sm border-2 border-transparent transition-colors group-hover:border-primary/50",
								SWATCH_CLASS[type],
								targets.length > 0 && current === type && "border-primary",
							)}
						/>
						<span className="text-muted-foreground truncate text-xs">
							{m.assets.transitionNames[type]}
						</span>
					</button>
				))}
			</div>
		</PanelView>
	);
}
