"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	AlignLeftIcon,
	AlignHorizontalCenterIcon,
	AlignRightIcon,
	AlignTopIcon,
	AlignVerticalCenterIcon,
	AlignBottomIcon,
	DistributeVerticalCenterIcon,
	DistributeHorizontalCenterIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import { useMessages } from "@/i18n";
import type { VisualElement } from "@/timeline";
import { getElementLocalTime } from "@/animation";
import { buildTransformFromParams } from "@/rendering";
import { resolveTransformAtTime } from "@/rendering/animation-values";
import { getElementBounds, type ElementBounds } from "@/preview/element-bounds";
import { buildTransformEditUpdates } from "@/timeline/transform-keyframes";
import { roundMediaTime, type MediaTime } from "@/wasm";
import {
	getAlignDelta,
	getDistributeDeltas,
	getMarginFrame,
	getSelectionFrame,
	type AlignMargins,
	type CanvasAlign,
	type DistributeAxis,
} from "@/text/align-clips";
import {
	DEFAULT_ALIGN_MARGIN,
	DEFAULT_DISTRIBUTE_GAP,
	useAlignMarginsStore,
} from "@/text/align-margins-store";

export interface TextAlignTarget {
	trackId: string;
	element: VisualElement;
}

const ALIGN_BUTTONS = [
	{ align: "left", icon: AlignLeftIcon },
	{ align: "centerX", icon: AlignHorizontalCenterIcon },
	{ align: "right", icon: AlignRightIcon },
	{ align: "top", icon: AlignTopIcon },
	{ align: "centerY", icon: AlignVerticalCenterIcon },
	{ align: "bottom", icon: AlignBottomIcon },
] as const satisfies { align: CanvasAlign; icon: unknown }[];

const DISTRIBUTE_BUTTONS = [
	{ axis: "vertical", icon: DistributeVerticalCenterIcon },
	{ axis: "horizontal", icon: DistributeHorizontalCenterIcon },
] as const satisfies { axis: DistributeAxis; icon: unknown }[];

/** 0 이상의 px 값. 입력 중에는 글자 그대로 두고, 칸을 벗어나거나 ⏎ 를 누를 때 반영한다 */
function PxField({
	label,
	value,
	defaultValue,
	onCommit,
}: {
	label: string;
	value: number;
	defaultValue: number;
	onCommit: (value: number) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<NumberField
			aria-label={label}
			title={label}
			className="w-16 text-center"
			value={draft ?? String(value)}
			suffix="px"
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => {
				const parsed = Number.parseFloat(draft ?? "");
				if (Number.isFinite(parsed)) onCommit(Math.max(0, Math.round(parsed)));
				setDraft(null);
			}}
			onScrub={(next) => onCommit(Math.max(0, Math.round(next)))}
			onReset={() => onCommit(defaultValue)}
			isDefault={value === defaultValue}
		/>
	);
}

/** 사각형 둘레에 위·오른쪽·아래·왼쪽 여백 칸을 둔다 */
function MarginBox() {
	const m = useMessages();
	const { margins, setMargin } = useAlignMarginsStore();
	const field = (side: keyof AlignMargins) => (
		<PxField
			label={m.properties.textAlign.margins[side]}
			value={margins[side]}
			defaultValue={DEFAULT_ALIGN_MARGIN}
			onCommit={(value) => setMargin({ side, value })}
		/>
	);
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center justify-items-center gap-1.5">
			<div />
			{field("top")}
			<div />
			{field("left")}
			<div className="border-muted-foreground/50 h-12 w-full rounded-sm border border-dashed" />
			{field("right")}
			<div />
			{field("bottom")}
			<div />
		</div>
	);
}

/** 자막을 여백 안쪽에 정렬하고, 여러 개면 화면에서 자막 상자 사이 간격을 맞춘다 */
export function TextAlignSection({ targets }: { targets: TextAlignTarget[] }) {
	const editor = useEditor();
	const m = useMessages();
	const { margins, resetMargins, gap, setGap } = useAlignMarginsStore();

	/** 각 자막의 현재 재생 위치 기준 상자. 키프레임이 있으면 그 시점에 키프레임으로 넣는다 */
	const measureTargets = () => {
		const canvasSize = editor.project.getActive().settings.canvasSize;
		const playhead = editor.playback.getCurrentTime();
		const measured = targets.flatMap(({ trackId, element }) => {
			const localTime = roundMediaTime({
				time: getElementLocalTime({
					timelineTime: playhead,
					elementStartTime: element.startTime,
					elementDuration: element.duration,
				}),
			});
			const bounds = getElementBounds({ element, canvasSize, localTime });
			return bounds ? [{ trackId, element, localTime, bounds }] : [];
		});
		return { canvasSize, measured };
	};

	const moveBy = (
		moves: {
			trackId: string;
			element: VisualElement;
			localTime: MediaTime;
			delta: { x: number; y: number };
		}[],
	) => {
		editor.timeline.updateElements({
			updates: moves.map(({ trackId, element, localTime, delta }) => {
				const { position } = resolveTransformAtTime({
					baseTransform: buildTransformFromParams({ params: element.params }),
					animations: element.animations,
					localTime,
				});
				return {
					trackId,
					elementId: element.id,
					patch: buildTransformEditUpdates({
						element,
						localTime,
						values: {
							"transform.positionX": position.x + delta.x,
							"transform.positionY": position.y + delta.y,
						},
					}),
				};
			}),
		});
	};

	const alignTo = (align: CanvasAlign) => {
		const { canvasSize, measured } = measureTargets();
		// 하나면 화면 여백 안쪽, 여러 개면 PPT처럼 고른 요소끼리 맞춘다
		const frame =
			measured.length > 1
				? getSelectionFrame({ bounds: measured.map(({ bounds }) => bounds) })
				: getMarginFrame({ canvasSize, margins });
		moveBy(
			measured.map((target) => ({
				...target,
				delta: getAlignDelta({ bounds: target.bounds, frame, align }),
			})),
		);
	};

	const distribute = (axis: DistributeAxis) => {
		const { measured } = measureTargets();
		const deltas = getDistributeDeltas({
			bounds: measured.map(({ bounds }): ElementBounds => bounds),
			axis,
			gap,
		});
		moveBy(measured.map((target, index) => ({ ...target, delta: deltas[index] })));
	};

	return (
		<Section collapsible sectionKey={`${targets[0].element.id}:textAlign`}>
			<SectionHeader>
				<SectionTitle>
					{targets.length > 1
						? m.properties.textAlign.titleForClips({ count: targets.length })
						: m.properties.textAlign.title}
				</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<div className="flex gap-1">
						{ALIGN_BUTTONS.map(({ align, icon }) => (
							<Button
								key={align}
								variant="ghost"
								size="icon"
								aria-label={m.properties.textAlign[align]}
								title={m.properties.textAlign[align]}
								onClick={() => alignTo(align)}
							>
								<HugeiconsIcon icon={icon} />
							</Button>
						))}
					</div>
					{targets.length === 1 && (
						<SectionField label={m.properties.textAlign.margins.title}>
							<MarginBox />
							<Button
								variant="ghost"
								size="sm"
								className="self-end"
								onClick={resetMargins}
							>
								{m.properties.textAlign.margins.reset}
							</Button>
						</SectionField>
					)}
					{targets.length > 1 && (
						<SectionField label={m.properties.textAlign.gap}>
							<div className="flex items-center gap-2">
								<PxField
									label={m.properties.textAlign.gap}
									value={gap}
									defaultValue={DEFAULT_DISTRIBUTE_GAP}
									onCommit={(value) => setGap({ gap: value })}
								/>
								{DISTRIBUTE_BUTTONS.map(({ axis, icon }) => (
									<Button
										key={axis}
										variant="ghost"
										size="icon"
										aria-label={m.properties.textAlign.distribute[axis]}
										title={m.properties.textAlign.distribute[axis]}
										onClick={() => distribute(axis)}
									>
										<HugeiconsIcon icon={icon} />
									</Button>
								))}
							</div>
						</SectionField>
					)}
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
