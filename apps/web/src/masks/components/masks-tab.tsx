"use client";

import type { MaskableElement } from "@/timeline";
import type {
	Mask,
	MaskBlendMode,
	MaskFill,
	MaskType,
	TextMask,
} from "@/masks/types";
import {
	buildMaskWithFill,
	duplicateMaskInList,
	moveMaskInList,
	nextMaskName,
	patchMaskMeta,
	resetMaskInList,
} from "@/masks/list-ops";
import {
	DEFAULT_FILL_STRENGTH,
	getMaskBlend,
	getMaskFill,
	isEffectFill,
} from "@/masks/fill";
import {
	resolveActiveMask,
	useActiveMaskStore,
} from "@/masks/active-mask-store";
import { toastUndoable } from "@/editor/undo-toast";
import { buildMaskParamPath } from "@/animation";
import { resolveMaskAtTime } from "@/animation/mask-param-channel";
import {
	buildMaskEditUpdates,
	getMaskKeyframesAtTime,
} from "@/masks/keyframes";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { KeyframeToggle } from "@/components/editor/panels/properties/components/keyframe-toggle";
import { Input } from "@/components/ui/input";
import type { NumberParamDefinition, SelectParamDefinition } from "@/params";
import { getMaskDefinition, getMaskDefinitionsForMenu } from "@/masks";
import { useEditor } from "@/editor/use-editor";
import { translateLabel, useMessages } from "@/i18n";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { useMenuPreview } from "@/editor/use-menu-preview";
import { getVisibleElementsWithBounds } from "@/preview/element-bounds";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowDown01Icon,
	ArrowExpandIcon,
	ArrowUp01Icon,
	BlurIcon,
	Copy01Icon,
	Delete02Icon,
	FeatherIcon,
	GridViewIcon,
	MoreHorizontalIcon,
	PencilEdit02Icon,
	PlusSignIcon,
	RefreshIcon,
	RotateClockwiseIcon,
	TextFontIcon,
	ViewIcon,
	ViewOffSlashIcon,
	UnfoldLessIcon,
	UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaTime } from "@/wasm";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ColorPicker } from "@/components/ui/color-picker";
import { FontPicker } from "@/components/ui/font-picker";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NumberField } from "@/components/ui/number-field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	clamp,
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionTitle,
} from "@/components/section";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	OcMirrorIcon,
	OcShapesIcon,
	OcTextHeightIcon,
	OcTextWidthIcon,
} from "@/components/icons";
import { cn } from "@/utils/ui";

type MasksTabProps = {
	element: MaskableElement;
	trackId: string;
};

type MaskItemProps = {
	mask: Mask;
	name: string;
	index: number;
	count: number;
	isActive: boolean;
	isSelected: boolean;
	isExpanded: boolean;
	onActivate: () => void;
	onToggleExpanded: () => void;
	previewParam: (key: string) => (value: number | string | boolean) => void;
	onCommit: () => void;
	onToggleHidden: () => void;
	onRename: (name: string) => void;
	onDuplicate: () => void;
	onReset: () => void;
	onInvert: () => void;
	onMove: (offset: number) => void;
	onDelete: () => void;
	onFillChange: (fill: MaskFill) => void;
	onBlendChange: (blend: MaskBlendMode) => void;
	keyframeToggle: KeyframeToggleRenderer;
};

type KeyframeToggleRenderer = (args: {
	keys: readonly string[];
	label: string;
}) => React.ReactNode;

type MaskKeyframeContext = {
	trackId: string;
	elementId: string;
	animations: MaskableElement["animations"];
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
};

type EmptyViewProps = {
	onAddMask: () => void;
};

type PreviewParamHandler = (
	key: string,
) => (value: number | string | boolean) => void;

type RegisteredMaskDefinition = ReturnType<typeof getMaskDefinition>;

function isTextMask(mask: Mask): mask is TextMask {
	return mask.type === "text";
}

export function MasksTab({ element, trackId }: MasksTabProps) {
	const editor = useEditor();
	const m = useMessages();
	const { renderElement, previewUpdates } = useElementPreview<MaskableElement>({
		trackId,
		elementId: element.id,
		fallback: element,
	});
	const maskDefs = getMaskDefinitionsForMenu();
	const tracks = useEditor(
		(e) => e.timeline.getPreviewTracks() ?? e.scenes.getActiveScene().tracks,
	);
	const currentTime = useEditor((e) => e.playback.getCurrentTime());
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const canvasSize = useEditor(
		(e) => e.project.getActive().settings.canvasSize,
	);
	const masks = element.masks ?? [];
	const renderMasks = renderElement.masks ?? masks;
	const animations = renderElement.animations;
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	const { onPointerLeave, onOpenChange, markCommitted } = useMenuPreview();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const activeMaskId = useActiveMaskStore((state) => state.activeMaskId);
	const setActiveMaskId = useActiveMaskStore((state) => state.setActiveMaskId);
	const activeMask = resolveActiveMask({ masks, activeMaskId });
	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
		() => new Set(activeMask ? [activeMask.id] : []),
	);
	const setExpanded = ({
		maskId,
		expanded,
	}: {
		maskId: string;
		expanded: boolean;
	}) =>
		setExpandedIds((current) => {
			const next = new Set(current);
			if (expanded) next.add(maskId);
			else next.delete(maskId);
			return next;
		});
	// 고른 마스크만 펼쳐서 목록이 길어지지 않게 한다. 여러 개를 같이 보려면 화살표로 펼친다
	const activateMask = (maskId: string) => {
		setActiveMaskId(maskId);
		setExpandedIds(new Set([maskId]));
		editor.selection.setSelectedMask({
			mask: { trackId, elementId: element.id, maskId },
		});
	};
	const selectedMask = useEditor((e) => e.selection.getSelectedMask());
	const isAllCollapsed = masks.every((mask) => !expandedIds.has(mask.id));
	const elementBounds = useMemo(() => {
		const clampedTime = Math.min(
			Math.max(currentTime, element.startTime),
			element.startTime + element.duration - 1,
		);

		return (
			getVisibleElementsWithBounds({
				tracks,
				currentTime: clampedTime,
				canvasSize,
				mediaAssets,
			}).find(
				(item) => item.trackId === trackId && item.elementId === element.id,
			)?.bounds ?? null
		);
	}, [
		canvasSize,
		currentTime,
		element.duration,
		element.id,
		element.startTime,
		mediaAssets,
		trackId,
		tracks,
	]);
	const elementSize = elementBounds
		? { width: elementBounds.width, height: elementBounds.height }
		: undefined;

	const getMaskName = (mask: Mask) =>
		mask.name ??
		translateLabel({
			messages: m,
			label: getMaskDefinition(mask.type).name,
		});

	const buildNewMask = ({
		maskType,
		fill,
	}: {
		maskType: MaskType;
		fill: MaskFill;
	}) => {
		const baseName =
			fill === "mosaic"
				? m.masks.presetMosaic
				: fill === "blur"
					? m.masks.presetBlur
					: translateLabel({
							messages: m,
							label: getMaskDefinition(maskType).name,
						});
		return buildMaskWithFill({
			maskType,
			fill,
			name: nextMaskName({ masks, baseName }),
			elementSize,
		});
	};

	const handleDropdownOpenChange = (open: boolean) => {
		setIsDropdownOpen(open);
		onOpenChange(open);
	};

	const previewMask = (args: { maskType: MaskType; fill: MaskFill }) => {
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						masks: [...masks, buildNewMask(args)],
					} as Partial<MaskableElement>,
				},
			],
		});
	};

	const commitMask = (args: { maskType: MaskType; fill: MaskFill }) => {
		// 미리보기를 그대로 확정하면 라벨 없는 스냅샷이 남아서, 버리고 라벨 붙은 명령으로 다시 넣는다
		editor.timeline.discardPreview();
		const mask = buildNewMask(args);
		const command = editor.timeline.updateMasks({
			trackId,
			elementId: element.id,
			masks: [...masks, mask],
			label: "Add mask",
		});
		activateMask(mask.id);
		toastUndoable({
			message: m.masks.added({ name: getMaskName(mask) }),
			command,
		});
		markCommitted();
		setIsDropdownOpen(false);
	};

	const applyMasks = ({
		nextMasks,
		label,
		toastMessage,
	}: {
		nextMasks: Mask[];
		label: string;
		toastMessage?: string;
	}) => {
		const command = editor.timeline.updateMasks({
			trackId,
			elementId: element.id,
			masks: nextMasks,
			label,
		});
		if (toastMessage) {
			toastUndoable({ message: toastMessage, command });
		}
	};

	const previewMaskParam =
		({ index, key }: { index: number; key: string }) =>
		(value: number | string | boolean) => {
			const target = renderMasks[index];
			if (!target) {
				return;
			}

			previewUpdates(
				buildMaskEditUpdates({
					masks: renderMasks,
					animations,
					maskId: target.id,
					patch: { [key]: value },
					localTime,
					isPlayheadWithinElementRange,
				}) as Partial<MaskableElement>,
			);
		};

	const keyframeContext: MaskKeyframeContext = {
		trackId,
		elementId: element.id,
		animations,
		localTime,
		isPlayheadWithinElementRange,
	};

	const menuItem = ({
		maskType,
		fill,
		label,
		icon,
	}: {
		maskType: MaskType;
		fill: MaskFill;
		label: string;
		icon: React.ReactNode;
	}) => (
		<DropdownMenuItem
			key={`${fill}:${maskType}`}
			onPointerEnter={() => previewMask({ maskType, fill })}
			onClick={() => commitMask({ maskType, fill })}
		>
			{icon}
			{label}
		</DropdownMenuItem>
	);

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center justify-between gap-2">
				<SectionTitle>{m.masks.title}</SectionTitle>
				<div className="flex items-center">
					{masks.length > 1 ? (
						<Button
							variant="ghost"
							size="icon"
							aria-label={
								isAllCollapsed ? m.masks.expandAll : m.masks.collapseAll
							}
							title={isAllCollapsed ? m.masks.expandAll : m.masks.collapseAll}
							onClick={() =>
								setExpandedIds(
									isAllCollapsed
										? new Set(masks.map((mask) => mask.id))
										: new Set(),
								)
							}
						>
							<HugeiconsIcon
								icon={isAllCollapsed ? UnfoldMoreIcon : UnfoldLessIcon}
								className="size-3.5!"
							/>
						</Button>
					) : null}
					<DropdownMenu
						open={isDropdownOpen}
						onOpenChange={handleDropdownOpenChange}
					>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" aria-label={m.masks.addMask}>
								<HugeiconsIcon icon={PlusSignIcon} className="size-3.5!" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							className="w-44"
							onPointerLeave={onPointerLeave}
						>
							<DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
								{m.masks.privacy}
							</DropdownMenuLabel>
							{menuItem({
								maskType: "rectangle",
								fill: "mosaic",
								label: m.masks.presetMosaic,
								icon: <HugeiconsIcon icon={GridViewIcon} />,
							})}
							{menuItem({
								maskType: "ellipse",
								fill: "blur",
								label: m.masks.presetBlur,
								icon: <HugeiconsIcon icon={BlurIcon} />,
							})}
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
								{m.masks.shapes}
							</DropdownMenuLabel>
							{maskDefs.map((definition) =>
								menuItem({
									maskType: definition.type,
									fill: "clip",
									label: translateLabel({
										messages: m,
										label: definition.name,
									}),
									icon: <HugeiconsIcon {...definition.icon} />,
								}),
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{masks.length === 0 ? (
				<EmptyView onAddMask={() => setIsDropdownOpen(true)} />
			) : (
				<div className="flex-1 overflow-y-auto">
					{masks.map((mask, index) => (
						<MaskItem
							key={mask.id}
							mask={resolveMaskAtTime({
								mask: renderMasks[index] ?? mask,
								animations,
								localTime,
							})}
							keyframeToggle={({ keys, label }) => (
								<MaskKeyframeToggle
									context={keyframeContext}
									mask={renderMasks[index] ?? mask}
									keys={keys}
									label={label}
								/>
							)}
							name={getMaskName(mask)}
							index={index}
							count={masks.length}
							isActive={activeMask?.id === mask.id}
							isSelected={
								selectedMask?.elementId === element.id &&
								selectedMask.maskId === mask.id
							}
							isExpanded={expandedIds.has(mask.id)}
							onActivate={() => activateMask(mask.id)}
							onToggleExpanded={() =>
								setExpanded({
									maskId: mask.id,
									expanded: !expandedIds.has(mask.id),
								})
							}
							previewParam={(paramKey) =>
								previewMaskParam({ index, key: paramKey })
							}
							onCommit={() =>
								editor.timeline.commitPreview({ label: "Edit mask" })
							}
							onToggleHidden={() =>
								applyMasks({
									nextMasks: patchMaskMeta({
										masks,
										maskId: mask.id,
										patch: { hidden: !mask.hidden },
									}),
									label: mask.hidden ? "Show mask" : "Hide mask",
									toastMessage: mask.hidden
										? m.masks.shown({ name: getMaskName(mask) })
										: m.masks.hidden({ name: getMaskName(mask) }),
								})
							}
							onRename={(name) =>
								applyMasks({
									nextMasks: patchMaskMeta({
										masks,
										maskId: mask.id,
										patch: { name },
									}),
									label: "Rename mask",
								})
							}
							onDuplicate={() => {
								const result = duplicateMaskInList({
									masks,
									maskId: mask.id,
									name: nextMaskName({ masks, baseName: getMaskName(mask) }),
								});
								applyMasks({
									nextMasks: result.masks,
									label: "Duplicate mask",
									toastMessage: m.masks.duplicated({ name: getMaskName(mask) }),
								});
								if (result.newId) activateMask(result.newId);
							}}
							onReset={() =>
								applyMasks({
									nextMasks: resetMaskInList({
										masks,
										maskId: mask.id,
										elementSize,
									}),
									label: "Reset mask",
									toastMessage: m.masks.resetDone({ name: getMaskName(mask) }),
								})
							}
							onInvert={() => {
								const command = editor.timeline.toggleMaskInverted({
									trackId,
									elementId: element.id,
									maskId: mask.id,
								});
								toastUndoable({
									message: m.masks.inverted({ name: getMaskName(mask) }),
									command,
								});
							}}
							onMove={(offset) =>
								applyMasks({
									nextMasks: moveMaskInList({
										masks,
										maskId: mask.id,
										offset,
									}),
									label: "Reorder masks",
								})
							}
							onDelete={() => {
								const command = editor.timeline.removeMask({
									trackId,
									elementId: element.id,
									maskId: mask.id,
								});
								toastUndoable({
									message: m.masks.removed({ name: getMaskName(mask) }),
									command,
								});
							}}
							onFillChange={(fill) =>
								applyMasks({
									nextMasks: patchMaskMeta({
										masks,
										maskId: mask.id,
										patch: { fill },
									}),
									label: "Change mask fill",
								})
							}
							onBlendChange={(blend) =>
								applyMasks({
									nextMasks: patchMaskMeta({
										masks,
										maskId: mask.id,
										patch: { blend },
									}),
									label: "Change mask blend",
								})
							}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/** 필드 묶음(위치면 X·Y)에 키프레임을 한꺼번에 넣거나 뺀다 */
function MaskKeyframeToggle({
	context,
	mask,
	keys,
	label,
}: {
	context: MaskKeyframeContext;
	mask: Mask;
	keys: readonly string[];
	label: string;
}) {
	const editor = useEditor();
	const m = useMessages();
	const {
		trackId,
		elementId,
		animations,
		localTime,
		isPlayheadWithinElementRange,
	} = context;
	const keyframesAtTime = getMaskKeyframesAtTime({
		animations,
		maskId: mask.id,
		keys,
		localTime,
	});
	const resolvedParams = new Map<string, unknown>(
		Object.entries(resolveMaskAtTime({ mask, animations, localTime }).params),
	);

	const toggle = () => {
		if (keyframesAtTime.length > 0) {
			editor.timeline.removeKeyframes({
				keyframes: keyframesAtTime.map((keyframe) => ({
					trackId,
					elementId,
					...keyframe,
				})),
			});
			return;
		}
		editor.timeline.upsertKeyframes({
			keyframes: keys.flatMap((key) => {
				const value = resolvedParams.get(key) ?? DEFAULT_FILL_STRENGTH;
				return typeof value === "number"
					? [
							{
								trackId,
								elementId,
								propertyPath: buildMaskParamPath({
									maskId: mask.id,
									paramKey: key,
								}),
								time: localTime,
								value,
							},
						]
					: [];
			}),
		});
	};

	return (
		<KeyframeToggle
			isActive={keyframesAtTime.length > 0}
			isDisabled={!isPlayheadWithinElementRange}
			title={m.properties.toggleKeyframe({ name: label })}
			onToggle={toggle}
		/>
	);
}

function MaskItem({
	mask,
	name,
	index,
	count,
	isActive,
	isSelected,
	isExpanded,
	onActivate,
	onToggleExpanded,
	previewParam,
	onCommit,
	onToggleHidden,
	onRename,
	onDuplicate,
	onReset,
	onInvert,
	onMove,
	onDelete,
	onFillChange,
	onBlendChange,
	keyframeToggle,
}: MaskItemProps) {
	const m = useMessages();
	const definition = getMaskDefinition(mask.type);
	const [isRenaming, setIsRenaming] = useState(false);
	const renameInputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (isRenaming) renameInputRef.current?.select();
	}, [isRenaming]);
	const fill = getMaskFill(mask);
	const fillLabel =
		fill === "mosaic"
			? m.masks.fillMosaic
			: fill === "blur"
				? m.masks.fillBlur
				: null;

	const finishRename = (value: string) => {
		setIsRenaming(false);
		const trimmed = value.trim();
		if (trimmed && trimmed !== name) onRename(trimmed);
	};

	return (
		<Section showTopBorder={false}>
			<div
				className={cn(
					"flex h-11 w-full items-center gap-1 px-2",
					isActive && "bg-accent/40",
					isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/40",
				)}
			>
				<Button
					variant="ghost"
					size="icon"
					aria-label={
						mask.hidden ? m.masks.show({ name }) : m.masks.hide({ name })
					}
					aria-pressed={!mask.hidden}
					onClick={onToggleHidden}
				>
					<HugeiconsIcon icon={mask.hidden ? ViewOffSlashIcon : ViewIcon} />
				</Button>
				{isRenaming ? (
					<Input
						ref={renameInputRef}
						defaultValue={name}
						className="h-7 flex-1"
						onBlur={(event) => finishRename(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter")
								finishRename(event.currentTarget.value);
							if (event.key === "Escape") setIsRenaming(false);
						}}
					/>
				) : (
					<button
						type="button"
						className={cn(
							"min-w-0 flex-1 flex items-center gap-2 h-full cursor-pointer text-left",
							mask.hidden && "opacity-50",
						)}
						onClick={onActivate}
						onDoubleClick={() => setIsRenaming(true)}
					>
						<HugeiconsIcon {...definition.icon} size={14} />
						<span
							className={cn(
								"truncate text-sm",
								isActive
									? "text-foreground font-medium"
									: "text-muted-foreground",
							)}
						>
							{name}
						</span>
						{fillLabel ? (
							<span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px]">
								{fillLabel}
							</span>
						) : null}
						{mask.hidden ? (
							<span className="text-muted-foreground shrink-0 text-[10px]">
								{m.masks.hiddenBadge}
							</span>
						) : null}
					</button>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label={m.masks.moreActions({ name })}
						>
							<HugeiconsIcon icon={MoreHorizontalIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40">
						<DropdownMenuItem onClick={() => setIsRenaming(true)}>
							<HugeiconsIcon icon={PencilEdit02Icon} />
							{m.masks.rename}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onDuplicate}>
							<HugeiconsIcon icon={Copy01Icon} />
							{m.masks.duplicate}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onInvert}>
							<OcMirrorIcon
								className={cn(mask.params.inverted && "-scale-x-100")}
							/>
							{m.masks.invert}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onReset}>
							<HugeiconsIcon icon={RefreshIcon} />
							{m.masks.reset}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem disabled={index === 0} onClick={() => onMove(-1)}>
							<HugeiconsIcon icon={ArrowUp01Icon} />
							{m.masks.moveUp}
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={index === count - 1}
							onClick={() => onMove(1)}
						>
							<HugeiconsIcon icon={ArrowDown01Icon} />
							{m.masks.moveDown}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onClick={onDelete}>
							<HugeiconsIcon icon={Delete02Icon} />
							{m.masks.delete}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					variant="ghost"
					size="icon"
					aria-label={
						isExpanded ? m.common.collapseSection : m.common.expandSection
					}
					aria-expanded={isExpanded}
					onClick={onToggleExpanded}
				>
					<HugeiconsIcon
						icon={ArrowDown01Icon}
						className={cn(
							"transition-transform duration-200",
							!isExpanded && "-rotate-90 text-muted-foreground",
						)}
					/>
				</Button>
			</div>
			{isExpanded ? (
				<SectionContent>
					<SectionFields>
						<MaskFillFields
							mask={mask}
							showBlend={index > 0 && fill === "clip"}
							previewParam={previewParam}
							onCommit={onCommit}
							onFillChange={onFillChange}
							onBlendChange={onBlendChange}
							keyframeToggle={keyframeToggle}
						/>
					</SectionFields>
					<MaskParamsFields
						mask={mask}
						definition={definition}
						previewParam={previewParam}
						onCommit={onCommit}
						keyframeToggle={keyframeToggle}
					/>
				</SectionContent>
			) : null}
		</Section>
	);
}

function MaskFillFields({
	mask,
	showBlend,
	previewParam,
	onCommit,
	onFillChange,
	onBlendChange,
	keyframeToggle,
}: {
	mask: Mask;
	showBlend: boolean;
	previewParam: PreviewParamHandler;
	onCommit: () => void;
	onFillChange: (fill: MaskFill) => void;
	onBlendChange: (blend: MaskBlendMode) => void;
	keyframeToggle?: KeyframeToggleRenderer;
}) {
	const m = useMessages();
	const fill = getMaskFill(mask);
	const strength = mask.params.fillStrength ?? DEFAULT_FILL_STRENGTH;
	const fillOptions: Array<{ value: MaskFill; label: string }> = [
		{ value: "clip", label: m.masks.fillClip },
		{ value: "mosaic", label: m.masks.fillMosaic },
		{ value: "blur", label: m.masks.fillBlur },
	];
	const blendOptions: Array<{ value: MaskBlendMode; label: string }> = [
		{ value: "add", label: m.masks.blendAdd },
		{ value: "subtract", label: m.masks.blendSubtract },
		{ value: "intersect", label: m.masks.blendIntersect },
	];

	return (
		<>
			<SectionField label={m.masks.fill}>
				<Select
					value={fill}
					onValueChange={(value) =>
						onFillChange(
							fillOptions.find((option) => option.value === value)?.value ??
								"clip",
						)
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{fillOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SectionField>
			{isEffectFill(fill) ? (
				<SectionField
					label={m.masks.strength}
					beforeLabel={keyframeToggle?.({
						keys: ["fillStrength"],
						label: m.masks.strength,
					})}
				>
					<div className="flex items-center gap-3">
						<Slider
							aria-label={m.masks.strength}
							value={[strength]}
							min={FILL_STRENGTH_MIN}
							max={FILL_STRENGTH_MAX}
							step={1}
							onValueChange={([value]) => previewParam("fillStrength")(value)}
							onValueCommit={onCommit}
							onReset={() => {
								previewParam("fillStrength")(DEFAULT_FILL_STRENGTH);
								onCommit();
							}}
						/>
						<span className="text-muted-foreground w-8 shrink-0 text-right text-xs tabular-nums">
							{Math.round(strength)}
						</span>
					</div>
				</SectionField>
			) : null}
			{showBlend ? (
				<SectionField label={m.masks.blend}>
					<Select
						value={getMaskBlend(mask)}
						onValueChange={(value) =>
							onBlendChange(
								blendOptions.find((option) => option.value === value)?.value ??
									"add",
							)
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{blendOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SectionField>
			) : null}
		</>
	);
}

const FILL_STRENGTH_MIN = 1;
const FILL_STRENGTH_MAX = 100;

function MaskParamsFields({
	mask,
	definition,
	previewParam,
	onCommit,
	keyframeToggle,
}: {
	mask: Mask;
	definition: RegisteredMaskDefinition;
	previewParam: PreviewParamHandler;
	onCommit: () => void;
	keyframeToggle?: KeyframeToggleRenderer;
}) {
	const m = useMessages();
	const featherParam = getNumberParamDefinition({
		definition,
		key: "feather",
	});
	const strokeWidthParam = getNumberParamDefinition({
		definition,
		key: "strokeWidth",
	});
	const previewNumberParam = (key: string) => (value: number) =>
		previewParam(key)(value);
	const previewStrokeColor = previewParam("strokeColor");
	const strokeAlignParam = definition.params.find(
		(param): param is SelectParamDefinition<string> =>
			param.key === "strokeAlign" && param.type === "select",
	);

	return (
		<SectionFields>
			{isTextMask(mask) ? (
				<TextMaskFields
					mask={mask}
					previewParam={previewParam}
					onCommit={onCommit}
					fontSizeParam={getNumberParamDefinition({
						definition,
						key: "fontSize",
					})}
				/>
			) : null}
			{definition.features.hasPosition &&
				"centerX" in mask.params &&
				"centerY" in mask.params && (
					<SectionField
						label={m.masks.position}
						beforeLabel={keyframeToggle?.({
							keys: ["centerX", "centerY"],
							label: m.masks.position,
						})}
					>
						<div className="flex items-center gap-2">
							<MaskNumberField
								className="flex-1"
								icon="X"
								param={getNumberParamDefinition({
									definition,
									key: "centerX",
								})}
								value={getMaskNumber({
									params: mask.params,
									key: "centerX",
								})}
								onPreview={previewNumberParam("centerX")}
								onCommit={onCommit}
							/>
							<MaskNumberField
								className="flex-1"
								icon="Y"
								param={getNumberParamDefinition({
									definition,
									key: "centerY",
								})}
								value={getMaskNumber({
									params: mask.params,
									key: "centerY",
								})}
								onPreview={previewNumberParam("centerY")}
								onCommit={onCommit}
							/>
						</div>
					</SectionField>
				)}

			{definition.features.sizeMode === "width-height" &&
				"width" in mask.params &&
				"height" in mask.params && (
					<SectionField
						label={m.masks.size}
						beforeLabel={keyframeToggle?.({
							keys: ["width", "height"],
							label: m.masks.size,
						})}
					>
						<div className="flex items-center gap-2">
							<MaskNumberField
								className="flex-1"
								icon="W"
								param={getNumberParamDefinition({
									definition,
									key: "width",
								})}
								value={getMaskNumber({
									params: mask.params,
									key: "width",
								})}
								onPreview={previewNumberParam("width")}
								onCommit={onCommit}
							/>
							<MaskNumberField
								className="flex-1"
								icon="H"
								param={getNumberParamDefinition({
									definition,
									key: "height",
								})}
								value={getMaskNumber({
									params: mask.params,
									key: "height",
								})}
								onPreview={previewNumberParam("height")}
								onCommit={onCommit}
							/>
						</div>
					</SectionField>
				)}

			{definition.features.sizeMode === "height-only" &&
				"height" in mask.params && (
					<SectionField
						label={m.masks.height}
						beforeLabel={keyframeToggle?.({
							keys: ["height"],
							label: m.masks.height,
						})}
					>
						<MaskNumberField
							icon="H"
							param={getNumberParamDefinition({
								definition,
								key: "height",
							})}
							value={getMaskNumber({
								params: mask.params,
								key: "height",
							})}
							onPreview={previewNumberParam("height")}
							onCommit={onCommit}
						/>
					</SectionField>
				)}

			{definition.features.sizeMode === "width-only" &&
				"width" in mask.params && (
					<SectionField
						label={m.masks.width}
						beforeLabel={keyframeToggle?.({
							keys: ["width"],
							label: m.masks.width,
						})}
					>
						<MaskNumberField
							icon="W"
							param={getNumberParamDefinition({
								definition,
								key: "width",
							})}
							value={getMaskNumber({
								params: mask.params,
								key: "width",
							})}
							onPreview={previewNumberParam("width")}
							onCommit={onCommit}
						/>
					</SectionField>
				)}

			{definition.features.sizeMode === "uniform" && "scale" in mask.params && (
				<SectionField
					label={m.masks.scale}
					beforeLabel={keyframeToggle?.({
						keys: ["scale"],
						label: m.masks.scale,
					})}
				>
					<MaskNumberField
						icon={
							isTextMask(mask) ? <HugeiconsIcon icon={ArrowExpandIcon} /> : "S"
						}
						param={getNumberParamDefinition({
							definition,
							key: "scale",
						})}
						value={getMaskNumber({
							params: mask.params,
							key: "scale",
						})}
						onPreview={previewNumberParam("scale")}
						onCommit={onCommit}
					/>
				</SectionField>
			)}

			{definition.features.hasRotation && "rotation" in mask.params && (
				<SectionField
					label={m.masks.rotation}
					beforeLabel={keyframeToggle?.({
						keys: ["rotation"],
						label: m.masks.rotation,
					})}
				>
					<MaskNumberField
						icon={<HugeiconsIcon icon={RotateClockwiseIcon} />}
						param={getNumberParamDefinition({
							definition,
							key: "rotation",
						})}
						value={getMaskNumber({
							params: mask.params,
							key: "rotation",
						})}
						onPreview={previewNumberParam("rotation")}
						onCommit={onCommit}
					/>
				</SectionField>
			)}

			<SectionField
				label={m.masks.feather}
				beforeLabel={keyframeToggle?.({
					keys: ["feather"],
					label: m.masks.feather,
				})}
			>
				<MaskNumberField
					icon={<HugeiconsIcon icon={FeatherIcon} />}
					param={featherParam}
					value={getMaskNumber({
						params: mask.params,
						key: "feather",
					})}
					onPreview={previewNumberParam("feather")}
					onCommit={onCommit}
				/>
			</SectionField>

			<SectionField label={m.masks.stroke}>
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<MaskNumberField
							className="flex-1"
							icon="W"
							param={strokeWidthParam}
							value={getMaskNumber({
								params: mask.params,
								key: "strokeWidth",
							})}
							onPreview={previewNumberParam("strokeWidth")}
							onCommit={onCommit}
						/>
						<ColorPicker
							className=""
							value={mask.params.strokeColor.replace(/^#/, "").toUpperCase()}
							onChange={(color) => previewStrokeColor(`#${color}`)}
							onChangeEnd={(color) => {
								previewStrokeColor(`#${color}`);
								onCommit();
							}}
						/>
					</div>
					{strokeAlignParam ? (
						<Select
							value={mask.params.strokeAlign}
							onValueChange={(value) => {
								previewParam("strokeAlign")(value);
								onCommit();
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{strokeAlignParam.options.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{translateLabel({ messages: m, label: option.label })}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : null}
				</div>
			</SectionField>
		</SectionFields>
	);
}

const LETTER_SPACING_PARAM: NumberParamDefinition = {
	key: "letterSpacing",
	label: "Letter spacing",
	type: "number",
	default: 0,
	min: -100,
	max: 500,
	step: 1,
};

const LINE_HEIGHT_PARAM: NumberParamDefinition = {
	key: "lineHeight",
	label: "Line height",
	type: "number",
	default: 1.2,
	min: 0.1,
	max: 10,
	step: 0.1,
};

function TextMaskFields({
	mask,
	previewParam,
	onCommit,
	fontSizeParam,
}: {
	mask: TextMask;
	previewParam: PreviewParamHandler;
	onCommit: () => void;
	fontSizeParam: NumberParamDefinition;
}) {
	const m = useMessages();
	const content = usePropertyDraft({
		displayValue: mask.params.content,
		parse: (input) => input,
		onPreview: (value) => previewParam("content")(value),
		onCommit,
	});

	const previewNumberParam = (key: string) => (value: number) =>
		previewParam(key)(value);

	return (
		<>
			<SectionField label={m.masks.content}>
				<Textarea
					value={content.displayValue}
					className="min-h-20"
					onFocus={content.onFocus}
					onChange={content.onChange}
					onBlur={content.onBlur}
				/>
			</SectionField>
			<SectionField label={m.masks.font}>
				<FontPicker
					defaultValue={mask.params.fontFamily}
					onValueChange={(value) => {
						previewParam("fontFamily")(value);
						onCommit();
					}}
				/>
			</SectionField>
			<SectionField label={m.masks.size}>
				<MaskNumberField
					icon={<HugeiconsIcon icon={TextFontIcon} />}
					param={fontSizeParam}
					value={mask.params.fontSize}
					onPreview={previewNumberParam("fontSize")}
					onCommit={onCommit}
				/>
			</SectionField>
			<SectionField label={m.masks.spacing}>
				<div className="flex items-start gap-2">
					<MaskNumberField
						className="w-1/2"
						icon={<OcTextWidthIcon size={14} />}
						param={LETTER_SPACING_PARAM}
						value={mask.params.letterSpacing ?? 0}
						onPreview={previewNumberParam("letterSpacing")}
						onCommit={onCommit}
					/>
					<MaskNumberField
						className="w-1/2"
						icon={<OcTextHeightIcon size={14} />}
						param={LINE_HEIGHT_PARAM}
						value={mask.params.lineHeight ?? 1.2}
						onPreview={previewNumberParam("lineHeight")}
						onCommit={onCommit}
					/>
				</div>
			</SectionField>
		</>
	);
}

function getNumberParamDefinition({
	definition,
	key,
}: {
	definition: RegisteredMaskDefinition;
	key: string;
}): NumberParamDefinition {
	const param = definition.params.find((candidate) => candidate.key === key);

	if (!param || param.type !== "number") {
		throw new Error(`Missing number param definition for mask key "${key}"`);
	}

	return param;
}

function getMaskNumber<
	TParams extends Mask["params"],
	TKey extends keyof TParams & string,
>({ params, key }: { params: TParams; key: TKey }): number {
	const value = params[key];

	if (typeof value !== "number") {
		throw new Error(`Expected numeric mask param for "${key}"`);
	}

	return value;
}

function MaskNumberField({
	param,
	value,
	onPreview,
	onCommit,
	icon,
	className,
}: {
	param: NumberParamDefinition;
	value: number;
	onPreview: (value: number) => void;
	onCommit: () => void;
	icon?: React.ReactNode;
	className?: string;
}) {
	const isPercent = param.unit === "percent";
	const percentMax = param.max ?? 100;
	const displayMultiplier = isPercent
		? 100 / percentMax
		: (param.displayMultiplier ?? 1);
	const min = isPercent ? 0 : param.min;
	const max = isPercent ? 100 : param.max;
	const step = isPercent ? 1 : param.step;
	const displayValue = value * displayMultiplier;
	const maxFractionDigits = getFractionDigitsForStep({ step });

	const clampDisplay = (nextDisplayValue: number) =>
		max !== undefined
			? clamp({ value: nextDisplayValue, min, max })
			: Math.max(min, nextDisplayValue);

	const previewFromDisplay = (nextDisplayValue: number) => {
		onPreview(
			clampDisplay(snapToStep({ value: nextDisplayValue, step })) /
				displayMultiplier,
		);
	};

	const draft = usePropertyDraft({
		displayValue: formatNumberForDisplay({
			value: displayValue,
			maxFractionDigits,
		}),
		parse: (input) => {
			const parsed = parseFloat(input);
			if (Number.isNaN(parsed)) return null;
			return (
				clampDisplay(snapToStep({ value: parsed, step })) / displayMultiplier
			);
		},
		onPreview,
		onCommit,
	});

	return (
		<NumberField
			className={className}
			icon={icon}
			value={draft.displayValue}
			dragSensitivity="slow"
			onFocus={draft.onFocus}
			onChange={draft.onChange}
			onBlur={draft.onBlur}
			onScrub={previewFromDisplay}
			onScrubEnd={onCommit}
		/>
	);
}

function EmptyView({ onAddMask }: EmptyViewProps) {
	const m = useMessages();
	return (
		<div className="flex flex-col h-full items-center justify-center gap-4 text-center">
			<OcShapesIcon className="size-10 text-muted-foreground" strokeWidth={1} />
			<div className="flex flex-col gap-2">
				<h3 className="font-medium text-foreground">{m.masks.emptyTitle}</h3>
				<p className="text-muted-foreground text-sm text-balance max-w-40">
					{m.masks.emptyHint}
				</p>
			</div>
			<Button variant="default" size="sm" onClick={onAddMask}>
				{m.masks.addMask}
			</Button>
		</div>
	);
}
