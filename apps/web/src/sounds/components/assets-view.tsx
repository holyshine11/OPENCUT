"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import {
	type MediaSortOrder,
	type MediaViewMode,
	type SoundSortKey,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useEditor } from "@/editor/use-editor";
import { useFileUpload } from "@/media/use-file-upload";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { toElementDurationTicks } from "@/timeline/creation";
import type { MediaTime } from "@/wasm";
import {
	importSoundAsMedia,
	type SoundItem,
	useSoundLibraryStore,
} from "@/sounds/sound-library";
import { useMessages } from "@/i18n";
import { cn } from "@/utils/ui";
import {
	CloudUploadIcon,
	Delete02Icon,
	GridViewIcon,
	LeftToRightListDashIcon,
	MusicNote03Icon,
	PauseIcon,
	PlayIcon,
	SortingOneNineIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const SORT_KEYS: SoundSortKey[] = ["name", "duration", "size"];

// One shared element so starting a preview stops the previous one.
let previewAudio: HTMLAudioElement | null = null;

function usePreviewPlayer() {
	const [playingId, setPlayingId] = useState<string | null>(null);

	useEffect(() => () => previewAudio?.pause(), []);

	const toggle = (sound: SoundItem) => {
		if (!previewAudio) previewAudio = new Audio();
		const audio = previewAudio;
		if (playingId === sound.id) {
			audio.pause();
			setPlayingId(null);
			return;
		}
		audio.src = sound.url;
		audio.onended = () => setPlayingId(null);
		void audio.play().catch(() => setPlayingId(null));
		setPlayingId(sound.id);
	};

	return { playingId, toggle };
}

export function SoundsView() {
	const m = useMessages();
	const { sounds, status, load, addFiles, remove } = useSoundLibraryStore();
	const {
		soundViewMode,
		setSoundViewMode,
		soundSortBy,
		soundSortOrder,
		setSoundSort,
	} = useAssetsPanelStore();
	const [query, setQuery] = useState("");
	const { playingId, toggle } = usePreviewPlayer();

	useEffect(() => {
		void load();
	}, [load]);

	const { isDragOver, dragProps, openFilePicker, fileInputProps } =
		useFileUpload({
			accept: "audio/*",
			multiple: true,
			onFilesSelected: async (files) => {
				try {
					const count = await addFiles(files);
					if (count > 0) toast.success(m.sounds.added({ count }));
				} catch (error) {
					console.error("Failed to add sounds:", error);
					toast.error(m.sounds.addFailed);
				}
			},
		});

	const handleSort = ({ key }: { key: SoundSortKey }) => {
		setSoundSort({
			key,
			order:
				soundSortBy === key && soundSortOrder === "asc" ? "desc" : "asc",
		});
	};

	const visibleSounds = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const filtered = needle
			? sounds.filter((sound) => sound.name.toLowerCase().includes(needle))
			: [...sounds];
		const direction = soundSortOrder === "asc" ? 1 : -1;
		filtered.sort((a, b) => {
			if (soundSortBy === "name") {
				return a.name.localeCompare(b.name, "ko") * direction;
			}
			return (a[soundSortBy] - b[soundSortBy]) * direction;
		});
		return filtered;
	}, [sounds, query, soundSortBy, soundSortOrder]);

	const isGrid = soundViewMode === "grid";

	return (
		<>
			<input {...fileInputProps} />
			<PanelView
				title={m.sounds.title}
				actions={
					<SoundActions
						viewMode={soundViewMode}
						setViewMode={setSoundViewMode}
						sortBy={soundSortBy}
						sortOrder={soundSortOrder}
						onSort={handleSort}
						onImport={openFilePicker}
					/>
				}
				className={cn(isDragOver && "bg-accent/30")}
				{...dragProps}
			>
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder={m.sounds.searchPlaceholder}
					className="mb-2 h-8"
				/>
				{status !== "ready" ? (
					<p className="text-muted-foreground p-2 text-sm">
						{m.sounds.loading}
					</p>
				) : visibleSounds.length === 0 ? (
					<p className="text-muted-foreground p-2 text-sm">{m.sounds.empty}</p>
				) : (
					<div
						className={cn(isGrid ? "grid gap-4" : "flex flex-col gap-1.5")}
						style={
							isGrid
								? { gridTemplateColumns: "repeat(auto-fill, 7rem)" }
								: undefined
						}
					>
						{visibleSounds.map((sound) => (
							<SoundItemRow
								key={sound.id}
								sound={sound}
								isGrid={isGrid}
								isPlaying={playingId === sound.id}
								onTogglePreview={() => toggle(sound)}
								onRemove={() => void remove(sound.id)}
							/>
						))}
					</div>
				)}
			</PanelView>
		</>
	);
}

function SoundItemRow({
	sound,
	isGrid,
	isPlaying,
	onTogglePreview,
	onRemove,
}: {
	sound: SoundItem;
	isGrid: boolean;
	isPlaying: boolean;
	onTogglePreview: () => void;
	onRemove: () => void;
}) {
	const m = useMessages();
	const editor = useEditor();

	const addAtTime = async ({ startTime }: { startTime: MediaTime }) => {
		const project = editor.project.getActive();
		if (!project) return;
		try {
			const asset = await importSoundAsMedia({
				sound,
				projectId: project.metadata.id,
				mediaAssets: editor.media.getAssets(),
				addMediaAsset: (args) => editor.media.addMediaAsset(args),
			});
			if (!asset) return;
			editor.timeline.insertElement({
				element: buildElementFromMedia({
					mediaId: asset.id,
					mediaType: asset.type,
					name: asset.name,
					duration: toElementDurationTicks({ seconds: asset.duration }),
					startTime,
				}),
				placement: { mode: "auto" },
			});
		} catch (error) {
			console.error("Failed to add sound:", error);
			toast.error(m.sounds.dropFailed);
		}
	};

	const previewLabel = isPlaying ? m.sounds.stopPreview : m.sounds.preview;

	return (
		<div className={cn("group/sound relative", !isGrid && "w-full")}>
			<DraggableItem
				name={sound.name}
				preview={
					<div className="text-muted-foreground flex size-full flex-col items-center justify-center rounded border">
						<HugeiconsIcon icon={MusicNote03Icon} className="size-5" />
						{isGrid && sound.duration > 0 && (
							<span className="text-xs opacity-70">
								{formatDuration(sound.duration)}
							</span>
						)}
					</div>
				}
				dragData={{
					id: sound.id,
					type: "sound",
					name: sound.name,
					url: sound.url,
					fileName: sound.fileName,
					size: sound.size,
					duration: sound.duration,
				}}
				shouldShowPlusOnDrag={false}
				onAddToTimeline={({ currentTime }) =>
					void addAtTime({ startTime: currentTime })
				}
				variant={isGrid ? "card" : "compact"}
				isRounded={isGrid ? false : undefined}
				className={cn(!isGrid && "pr-14")}
			/>
			<Button
				size="icon"
				variant="ghost"
				aria-label={previewLabel}
				title={previewLabel}
				className={cn(
					"absolute z-10 size-6",
					isGrid
						? "bg-background/80 hover:bg-background top-1 left-1"
						: "top-1/2 left-1 -translate-y-1/2 bg-background",
					!isPlaying && "opacity-0 group-hover/sound:opacity-100 focus-visible:opacity-100",
				)}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={onTogglePreview}
			>
				<HugeiconsIcon
					icon={isPlaying ? PauseIcon : PlayIcon}
					className="size-3.5"
				/>
			</Button>
			{!isGrid && sound.duration > 0 && (
				<span
					className={cn(
						"text-muted-foreground pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs",
						sound.isUser ? "right-8" : "right-2",
					)}
				>
					{formatDuration(sound.duration)}
				</span>
			)}
			{sound.isUser && (
				<Button
					size="icon"
					variant="ghost"
					aria-label={m.sounds.delete}
					title={m.sounds.delete}
					className={cn(
						"text-muted-foreground hover:text-destructive absolute z-10 size-6 opacity-0 group-hover/sound:opacity-100 focus-visible:opacity-100",
						isGrid
							? "bg-background/80 hover:bg-background top-1 right-1"
							: "top-1/2 right-1 -translate-y-1/2",
					)}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={onRemove}
				>
					<HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
				</Button>
			)}
		</div>
	);
}

function formatDuration(duration: number) {
	if (duration < 10) return `${duration.toFixed(1)}s`;
	const min = Math.floor(duration / 60);
	const sec = Math.floor(duration % 60);
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

function SoundActions({
	viewMode,
	setViewMode,
	sortBy,
	sortOrder,
	onSort,
	onImport,
}: {
	viewMode: MediaViewMode;
	setViewMode: (mode: MediaViewMode) => void;
	sortBy: SoundSortKey;
	sortOrder: MediaSortOrder;
	onSort: ({ key }: { key: SoundSortKey }) => void;
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
							onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
							className="items-center justify-center"
						>
							<HugeiconsIcon
								icon={viewMode === "grid" ? LeftToRightListDashIcon : GridViewIcon}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							{viewMode === "grid" ? m.media.switchToList : m.media.switchToGrid}
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
									className="items-center justify-center"
								>
									<HugeiconsIcon icon={SortingOneNineIcon} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<DropdownMenuContent align="end">
							{SORT_KEYS.map((key) => (
								<DropdownMenuItem key={key} onClick={() => onSort({ key })}>
									{m.media.sortBy[key]}{" "}
									{sortBy === key ? (sortOrder === "asc" ? "↑" : "↓") : ""}
								</DropdownMenuItem>
							))}
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
				size="sm"
				className="items-center justify-center gap-1.5"
			>
				<HugeiconsIcon icon={CloudUploadIcon} />
				{m.media.import}
			</Button>
		</div>
	);
}
