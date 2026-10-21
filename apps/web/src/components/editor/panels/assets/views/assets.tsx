"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { MediaDragOverlay } from "@/components/editor/panels/assets/drag-overlay";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { useFileUpload } from "@/media/use-file-upload";
import { invokeAction } from "@/actions";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import {
	SelectableItem,
	SelectableSurface,
	useSelection,
	useSelectionScope,
} from "@/selection";
import { buildElementFromMedia } from "@/timeline/element-utils";
import {
	type MediaSortKey,
	type MediaSortOrder,
	type MediaViewMode,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { MASKABLE_ELEMENT_TYPES } from "@/timeline";
import type { MediaAsset, MediaType } from "@/media/types";
import { useSoundLibraryStore } from "@/sounds/sound-library";
import { cn } from "@/utils/ui";
import {
	CloudUploadIcon,
	Delete02Icon,
	Folder03Icon,
	GridViewIcon,
	LeftToRightListDashIcon,
	SortingOneNineIcon,
	Image02Icon,
	MusicNote03Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useMessages } from "@/i18n";

export function MediaView() {
	const editor = useEditor();
	const m = useMessages();
	const mediaFiles = useEditor((e) => e.media.getAssets());
	const activeProject = useEditor((e) => e.project.getActive());

	const sounds = useSoundLibraryStore((state) => state.sounds);
	useEffect(() => {
		void useSoundLibraryStore.getState().load();
	}, []);

	const {
		mediaTab,
		setMediaTab,
		mediaViewMode,
		setMediaViewMode,
		highlightMediaId,
		clearHighlight,
		mediaSortBy,
		mediaSortOrder,
		setMediaSort,
	} = useAssetsPanelStore();

	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);

	const processFiles = async ({ files }: { files: File[] }) => {
		if (!files || files.length === 0) return;
		if (!activeProject) {
			toast.error(m.notices.media.noActiveProject);
			return;
		}

		setIsProcessing(true);
		setProgress(0);
		try {
			await showMediaUploadToast({
				filesCount: files.length,
				promise: async () => {
					const processedAssets = await processMediaAssets({
						files,
						onProgress: (progress: { progress: number }) =>
							setProgress(progress.progress),
					});
					for (const asset of processedAssets) {
						await editor.media.addMediaAsset({
							projectId: activeProject.metadata.id,
							asset,
						});
					}
					return {
						uploadedCount: processedAssets.length,
						assetNames: processedAssets.map((asset) => asset.name),
					};
				},
			});
		} catch (error) {
			console.error("Error processing files:", error);
		} finally {
			setIsProcessing(false);
			setProgress(0);
		}
	};

	const { isDragOver, dragProps, openFilePicker, fileInputProps } =
		useFileUpload({
			accept: "image/*,video/*,audio/*",
			multiple: true,
			onFilesSelected: (files) => processFiles({ files }),
		});

	const handleRemove = ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => {
		event.stopPropagation();

		invokeAction("remove-media-assets", {
			projectId: activeProject.metadata.id,
			assetIds: ids,
		});
	};

	const handleSort = ({ key }: { key: MediaSortKey }) => {
		if (mediaSortBy === key) {
			setMediaSort({
				key,
				order: mediaSortOrder === "asc" ? "desc" : "asc",
			});
		} else {
			setMediaSort({ key, order: "asc" });
		}
	};

	// 다른 탭의 미디어로 이동해 달라는 요청이 오면 그 종류의 탭을 연다
	useEffect(() => {
		const target = mediaFiles.find((item) => item.id === highlightMediaId);
		if (target) setMediaTab(target.type);
	}, [highlightMediaId, mediaFiles, setMediaTab]);

	const filteredMediaItems = useMemo(() => {
		// 효과음 탭에서 넣은 소리는 효과음 탭에서만 보인다 (importSoundAsMedia와 같은 이름·크기 기준)
		const soundKeys = new Set(
			sounds.map((sound) => `${sound.fileName}:${sound.size}`),
		);
		const filtered = mediaFiles.filter(
			(item) =>
				!item.ephemeral &&
				item.type === mediaTab &&
				!soundKeys.has(`${item.name}:${item.file.size}`),
		);

		filtered.sort((a, b) => {
			let valueA: string | number;
			let valueB: string | number;

			switch (mediaSortBy) {
				case "name":
					valueA = a.name.toLowerCase();
					valueB = b.name.toLowerCase();
					break;
				case "type":
					valueA = a.type;
					valueB = b.type;
					break;
				case "duration":
					valueA = a.duration || 0;
					valueB = b.duration || 0;
					break;
				case "size":
					valueA = a.file.size;
					valueB = b.file.size;
					break;
				default:
					return 0;
			}

			if (valueA < valueB) return mediaSortOrder === "asc" ? -1 : 1;
			if (valueA > valueB) return mediaSortOrder === "asc" ? 1 : -1;
			return 0;
		});

		return filtered;
	}, [mediaFiles, mediaTab, sounds, mediaSortBy, mediaSortOrder]);
	const orderedMediaIds = useMemo(() => {
		return filteredMediaItems.map((item) => item.id);
	}, [filteredMediaItems]);

	const openFolder = () => {
		if (!activeProject) return;
		const folderUrl = (name?: string) =>
			`/api/media-folder?${new URLSearchParams({
				// 이름이 같은 프로젝트끼리 섞이지 않게 id 앞부분을 붙인다
				project: `${activeProject.metadata.name} (${activeProject.metadata.id.slice(0, FOLDER_ID_LENGTH)})`,
				kind: m.media[mediaTab],
				...(name && { name }),
			})}`;
		const send = async ({ url, init }: { url: string; init: RequestInit }) => {
			const response = await fetch(url, init);
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.error ?? m.media.openFolderFailed);
			}
		};
		toast.promise(
			async () => {
				for (const item of filteredMediaItems) {
					const exists = await fetch(
						`${folderUrl(item.name)}&size=${item.file.size}`,
						{ method: "HEAD" },
					);
					if (exists.status === 204) continue;
					await send({
						url: folderUrl(item.name),
						init: { method: "PUT", body: item.file },
					});
				}
				await send({ url: folderUrl(), init: { method: "POST" } });
			},
			{
				loading: m.media.openingFolder,
				success: m.media.openedFolder,
				error: (error: Error) => error.message,
			},
		);
	};

	return (
		<>
			<input {...fileInputProps} />

			<PanelView
				title={m.media.title}
				actions={
					<MediaActions
						onOpenFolder={openFolder}
						mediaViewMode={mediaViewMode}
						setMediaViewMode={setMediaViewMode}
						isProcessing={isProcessing}
						sortBy={mediaSortBy}
						sortOrder={mediaSortOrder}
						onSort={handleSort}
						onImport={openFilePicker}
					/>
				}
				className={cn(isDragOver && "bg-accent/30")}
				contentClassName="h-full"
				{...dragProps}
			>
				<Tabs
					value={mediaTab}
					onValueChange={(value) => {
						const tab = MEDIA_TABS.find((key) => key === value);
						if (tab) setMediaTab(tab);
					}}
					variant="underline"
					className="mb-2"
				>
					<TabsList aria-label={m.media.title}>
						{MEDIA_TABS.map((tab) => (
							<TabsTrigger key={tab} value={tab}>
								{m.media[tab]}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				{isDragOver || filteredMediaItems.length === 0 ? (
					<MediaDragOverlay
						isVisible={true}
						isProcessing={isProcessing}
						progress={progress}
						onClick={openFilePicker}
					/>
				) : (
					<SelectableSurface
						ariaLabel={m.media.title}
						orderedIds={orderedMediaIds}
						revealId={highlightMediaId}
						onRevealComplete={clearHighlight}
					>
						<MediaScopeRegistrar />
						<MediaBulkBar ids={orderedMediaIds} onRemove={handleRemove} />
						<MediaItemList
							items={filteredMediaItems}
							mode={mediaViewMode}
							onRemove={handleRemove}
						/>
					</SelectableSurface>
				)}
			</PanelView>
		</>
	);
}

const MEDIA_TABS: MediaType[] = ["video", "audio", "image"];
const FOLDER_ID_LENGTH = 8;

function MediaScopeRegistrar() {
	useSelectionScope();
	return null;
}

// 체크박스를 눌러도 목록 바탕 클릭(선택 해제)·박스 선택·드래그가 시작되지 않게 막는다
function stopSurfaceEvents(event: React.SyntheticEvent) {
	event.stopPropagation();
}

function MediaBulkBar({
	ids,
	onRemove,
}: {
	ids: string[];
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const m = useMessages();
	const { selectedIds, setSelection } = useSelection();
	const allChecked =
		selectedIds.length === 0
			? false
			: selectedIds.length === ids.length
				? true
				: "indeterminate";

	return (
		<div
			role="toolbar"
			className="mb-2 flex items-center justify-between gap-2"
			onClick={stopSurfaceEvents}
			onKeyDown={stopSurfaceEvents}
			onMouseDown={stopSurfaceEvents}
			onPointerDown={stopSurfaceEvents}
		>
			<label className="flex items-center gap-2 text-xs">
				<Checkbox
					checked={allChecked}
					onCheckedChange={(checked) => setSelection(checked ? ids : [])}
				/>
				{m.media.selectAll}
			</label>
			<Button
				size="sm"
				variant="ghost"
				className="text-muted-foreground hover:text-destructive h-7 gap-1 px-2 text-xs"
				disabled={selectedIds.length === 0}
				onClick={(event) => onRemove({ event, ids: selectedIds })}
			>
				<HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
				{selectedIds.length > 0
					? m.media.deleteItems({ count: selectedIds.length })
					: m.media.delete}
			</Button>
		</div>
	);
}

function MediaAssetDraggable({
	item,
	preview,
	variant,
	isRounded,
}: {
	item: MediaAsset;
	preview: React.ReactNode;
	variant: "card" | "compact";
	isRounded?: boolean;
}) {
	const editor = useEditor();

	const addElementAtTime = ({
		asset,
		startTime,
	}: {
		asset: MediaAsset;
		startTime: MediaTime;
	}) => {
		const duration =
			asset.duration != null
				? mediaTimeFromSeconds({ seconds: asset.duration })
				: DEFAULT_NEW_ELEMENT_DURATION;
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime,
		});
		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<DraggableItem
			name={item.name}
			preview={preview}
			dragData={{
				id: item.id,
				type: "media",
				mediaType: item.type,
				name: item.name,
				...(item.type !== "audio" && {
					targetElementTypes: [...MASKABLE_ELEMENT_TYPES],
				}),
			}}
			shouldShowPlusOnDrag={false}
			onAddToTimeline={({ currentTime }) =>
				addElementAtTime({ asset: item, startTime: currentTime })
			}
			variant={variant}
			isRounded={isRounded}
		/>
	);
}

function MediaItemWithContextMenu({
	item,
	isGrid,
	children,
	onRemove,
}: {
	item: MediaAsset;
	isGrid: boolean;
	children: React.ReactNode;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const m = useMessages();
	const { isSelected, selectedIds, setSelection } = useSelection();
	const idsToDelete = isSelected(item.id) ? selectedIds : [item.id];
	const deleteLabel =
		idsToDelete.length > 1
			? m.media.deleteItems({ count: idsToDelete.length })
			: m.media.delete;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className={cn(
						"group/media relative",
						!isGrid && "flex w-full items-center gap-2",
					)}
				>
					<Checkbox
						aria-label={item.name}
						checked={isSelected(item.id)}
						onCheckedChange={(checked) =>
							setSelection(
								checked
									? [...selectedIds, item.id]
									: selectedIds.filter((id) => id !== item.id),
							)
						}
						onClick={stopSurfaceEvents}
						onMouseDown={stopSurfaceEvents}
						onPointerDown={stopSurfaceEvents}
						className={cn(isGrid && "absolute top-1 left-1 z-10")}
					/>
					{children}
					<Button
						size="icon"
						variant="ghost"
						aria-label={deleteLabel}
						title={deleteLabel}
						className={cn(
							"text-muted-foreground hover:text-destructive absolute z-10 size-6 opacity-0 group-hover/media:opacity-100 focus-visible:opacity-100",
							isGrid
								? "bg-background/80 hover:bg-background top-1 right-1"
								: "top-1/2 right-1 -translate-y-1/2",
						)}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => onRemove({ event, ids: idsToDelete })}
					>
						<HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
					</Button>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem>{m.media.exportClips}</ContextMenuItem>
				<ContextMenuItem
					variant="destructive"
					onClick={(event: React.MouseEvent<HTMLDivElement>) =>
						onRemove({ event, ids: idsToDelete })
					}
				>
					{deleteLabel}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function MediaItemList({
	items,
	mode,
	onRemove,
}: {
	items: MediaAsset[];
	mode: MediaViewMode;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const isGrid = mode === "grid";

	return (
		<div
			className={cn(isGrid ? "grid gap-4" : "flex flex-col gap-1.5")}
			style={
				isGrid ? { gridTemplateColumns: "repeat(auto-fill, 7rem)" } : undefined
			}
		>
			{items.map((item) => (
				<MediaItemWithContextMenu
					item={item}
					isGrid={isGrid}
					onRemove={onRemove}
					key={item.id}
				>
					<SelectableItem className={cn(!isGrid && "w-full")} id={item.id}>
						<MediaAssetDraggable
							item={item}
							preview={
								<MediaPreview
									item={item}
									variant={isGrid ? "grid" : "compact"}
								/>
							}
							variant={isGrid ? "card" : "compact"}
							isRounded={isGrid ? false : undefined}
						/>
					</SelectableItem>
				</MediaItemWithContextMenu>
			))}
		</div>
	);
}

function formatDuration({ duration }: { duration: number }) {
	const min = Math.floor(duration / 60);
	const sec = Math.floor(duration % 60);
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

function MediaDurationBadge({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<div className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-xs text-white">
			{formatDuration({ duration })}
		</div>
	);
}

function MediaDurationLabel({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<span className="text-xs opacity-70">{formatDuration({ duration })}</span>
	);
}

function MediaTypePlaceholder({
	icon,
	label,
	duration,
	variant,
}: {
	icon: IconSvgElement;
	label: string;
	duration?: number;
	variant: "muted" | "bordered";
}) {
	const iconClassName = cn("size-6", variant === "bordered" && "mb-1");

	return (
		<div
			className={cn(
				"text-muted-foreground flex size-full flex-col items-center justify-center rounded",
				variant === "muted" ? "bg-muted/30" : "border",
			)}
		>
			<HugeiconsIcon icon={icon} className={iconClassName} />
			<span className="text-xs">{label}</span>
			<MediaDurationLabel duration={duration} />
		</div>
	);
}

function MediaPreview({
	item,
	variant = "grid",
}: {
	item: MediaAsset;
	variant?: "grid" | "compact";
}) {
	const m = useMessages();
	const shouldShowDurationBadge = variant === "grid";

	if (item.type === "image") {
		return (
			<div className="relative flex size-full items-center justify-center bg-muted">
				<Image
					src={item.url ?? ""}
					alt={item.name}
					fill
					sizes="100vw"
					className="object-cover"
					loading="lazy"
					unoptimized
				/>
			</div>
		);
	}

	if (item.type === "video") {
		if (item.thumbnailUrl) {
			return (
				<div className="relative size-full">
					<Image
						src={item.thumbnailUrl}
						alt={item.name}
						fill
						sizes="100vw"
						className="rounded object-cover"
						loading="lazy"
						unoptimized
					/>
					{shouldShowDurationBadge ? (
						<MediaDurationBadge duration={item.duration} />
					) : null}
				</div>
			);
		}

		return (
			<MediaTypePlaceholder
				icon={Video01Icon}
				label={m.media.video}
				duration={item.duration}
				variant="muted"
			/>
		);
	}

	if (item.type === "audio") {
		return (
			<MediaTypePlaceholder
				icon={MusicNote03Icon}
				label={m.media.audio}
				duration={item.duration}
				variant="bordered"
			/>
		);
	}

	return (
		<MediaTypePlaceholder
			icon={Image02Icon}
			label={m.media.unknown}
			variant="muted"
		/>
	);
}

function MediaActions({
	mediaViewMode,
	setMediaViewMode,
	isProcessing,
	sortBy,
	sortOrder,
	onSort,
	onImport,
	onOpenFolder,
}: {
	onOpenFolder: () => void;
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;
	isProcessing: boolean;
	sortBy: MediaSortKey;
	sortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
	onImport: () => void;
}) {
	const m = useMessages();
	return (
		<div className="flex gap-1.5">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							onClick={onOpenFolder}
							disabled={isProcessing}
							aria-label={m.media.openFolder}
							className="items-center justify-center"
						>
							<HugeiconsIcon icon={Folder03Icon} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>{m.media.openFolder}</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							onClick={() =>
								setMediaViewMode(mediaViewMode === "grid" ? "list" : "grid")
							}
							disabled={isProcessing}
							className="items-center justify-center"
						>
							{mediaViewMode === "grid" ? (
								<HugeiconsIcon icon={LeftToRightListDashIcon} />
							) : (
								<HugeiconsIcon icon={GridViewIcon} />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							{mediaViewMode === "grid"
								? m.media.switchToList
								: m.media.switchToGrid}
						</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<DropdownMenu>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									disabled={isProcessing}
									className="items-center justify-center"
								>
									<HugeiconsIcon icon={SortingOneNineIcon} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<DropdownMenuContent align="end">
							<SortMenuItem
								label={m.media.sortBy.name}
								sortKey="name"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label={m.media.sortBy.type}
								sortKey="type"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label={m.media.sortBy.duration}
								sortKey="duration"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label={m.media.sortBy.size}
								sortKey="size"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
					<TooltipContent>
						<p>
							{m.media.sortTooltip({
								field: m.media.sortBy[sortBy],
								ascending: sortOrder === "asc",
							})}
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<Button
				variant="outline"
				onClick={onImport}
				disabled={isProcessing}
				size="sm"
				className="items-center justify-center gap-1.5"
			>
				<HugeiconsIcon icon={CloudUploadIcon} />
				{m.media.import}
			</Button>
		</div>
	);
}

function SortMenuItem({
	label,
	sortKey,
	currentSortBy,
	currentSortOrder,
	onSort,
}: {
	label: string;
	sortKey: MediaSortKey;
	currentSortBy: MediaSortKey;
	currentSortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
}) {
	const isActive = currentSortBy === sortKey;
	const arrow = isActive ? (currentSortOrder === "asc" ? "↑" : "↓") : "";

	return (
		<DropdownMenuItem onClick={() => onSort({ key: sortKey })}>
			{label} {arrow}
		</DropdownMenuItem>
	);
}
