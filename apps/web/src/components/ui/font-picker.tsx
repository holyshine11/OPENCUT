"use client";

import { useMessages } from "@/i18n";
import {
	useState,
	useMemo,
	useRef,
	useEffect,
	useCallback,
	type CSSProperties,
} from "react";
import { List, type RowComponentProps } from "react-window";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadFullFont } from "@/fonts/google-fonts";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import { queryLocalFontFamilies } from "@/fonts/local-fonts";
import type { FontAtlas, FontAtlasEntry } from "@/fonts/types";
import { useFontAtlas } from "@/fonts/use-font-atlas";
import { isBundledFont } from "@/fonts/bundled-fonts";
import { useFontFavorites } from "@/fonts/favorites-store";
import { cn } from "@/utils/ui";
import { ChevronDown, Heart, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon } from "@hugeicons/core-free-icons";

const FONT_TABS = [
	{ key: "all", label: "allFonts" },
	{ key: "my-fonts", label: "myFonts" },
	{ key: "favorites", label: "favoriteFonts" },
] as const;

type FontTab = (typeof FONT_TABS)[number]["key"];

const ROW_HEIGHT = 40;
const PREVIEW_SCALE = 0.8;
const LIST_WIDTH = 288;
const MAX_LIST_HEIGHT = 288;
const OVERSCAN = 15;

interface FontPickerProps {
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

export function FontPicker({
	defaultValue,
	onValueChange,
	className,
}: FontPickerProps) {
	const m = useMessages();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState<FontTab>("all");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const {
		atlas,
		status,
		fontNames,
		retry: handleRetry,
	} = useFontAtlas({ open });
	const [localFonts, setLocalFonts] = useState<string[] | null>(null);
	const [localFontsError, setLocalFontsError] = useState<string | null>(null);

	const favorites = useFontFavorites((state) => state.favorites);
	const toggleFavorite = useFontFavorites((state) => state.toggle);

	const isMyFonts = activeTab === "my-fonts";
	const isFavorites = activeTab === "favorites";
	const isAllFonts = activeTab === "all";
	const tabFonts = useMemo(() => {
		if (isFavorites) return favorites.map((favorite) => favorite.family);
		return isMyFonts ? (localFonts ?? []) : fontNames;
	}, [isFavorites, favorites, isMyFonts, localFonts, fontNames]);
	const favoriteFamilies = useMemo(
		() => new Set(favorites.map((favorite) => favorite.family)),
		[favorites],
	);

	const filteredFonts = useMemo(() => {
		if (!search) return tabFonts;
		const query = search.toLowerCase();
		return tabFonts.filter((name) => name.toLowerCase().includes(query));
	}, [tabFonts, search]);

	const handleTabClick = (tab: FontTab) => {
		setActiveTab(tab);
		if (tab !== "my-fonts" || localFonts) return;
		setLocalFontsError(null);
		queryLocalFontFamilies()
			.then(setLocalFonts)
			.catch(() => setLocalFontsError(m.ui.localFontsFailed));
	};

	const listHeight = Math.min(
		MAX_LIST_HEIGHT,
		filteredFonts.length * ROW_HEIGHT,
	);

	const handleSelect = useCallback(
		async ({ family }: { family: string }) => {
			// Installed fonts load through loadFullFont too (Safari can't use them by name)
			if (!SYSTEM_FONTS.has(family)) {
				try {
					await loadFullFont({ family });
				} catch {
					// ignore load failure, font will fall back to system default
				}
			}
			onValueChange?.(family);
			setOpen(false);
		},
		[onValueChange],
	);

	// 내 글꼴 탭에서 누른 하트만 설치된 글꼴로 기억한다
	const handleToggleFavorite = useCallback(
		({ family }: { family: string }) =>
			toggleFavorite({ family, isLocal: isMyFonts }),
		[toggleFavorite, isMyFonts],
	);

	useEffect(() => {
		if (!open) {
			setSearch("");
			setActiveTab("all");
		}
	}, [open]);

	const activeTabLabel =
		m.ui[FONT_TABS.find((t) => t.key === activeTab)?.label ?? "allFonts"];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="text-muted-foreground [&_svg]:size-3.5 shrink-0">
						<HugeiconsIcon icon={TextIcon} />
					</span>
					<span className="truncate" style={{ fontFamily: defaultValue }}>
						{defaultValue ?? "Select a font"}
					</span>
				</div>
				<ChevronDown className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 p-0 overflow-hidden"
				align="start"
				side="left"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<div className="relative px-3 py-1.5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 shrink-0 opacity-50" />
					<Input
						ref={searchInputRef}
						placeholder={m.ui.searchFonts({ tab: activeTabLabel })}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						size="xs"
						className="w-full pl-5 bg-transparent border-none! shadow-none!"
					/>
				</div>
				<div className="flex border-b px-3">
					{FONT_TABS.map((tab) => (
						<button
							key={tab.key}
							type="button"
							className={cn(
								"px-3 py-1.5 text-xs border-b-2 -mb-px",
								activeTab === tab.key
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
							onClick={() => handleTabClick(tab.key)}
						>
							{m.ui[tab.label]}
						</button>
					))}
				</div>
				{isMyFonts && localFontsError && (
					<div className="py-8 px-4 text-center text-sm text-muted-foreground">
						{localFontsError}
					</div>
				)}
				{isMyFonts && !localFontsError && !localFonts && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						{m.ui.loadingInstalledFonts}
					</div>
				)}
				{isFavorites && favorites.length === 0 && (
					<div className="py-8 px-4 text-center text-sm text-muted-foreground">
						{m.ui.noFavoriteFonts}
					</div>
				)}
				{isAllFonts && status === "loading" && (
					<div className="py-8 text-center text-sm text-muted-foreground">
						{m.ui.loadingFonts}
					</div>
				)}
				{isAllFonts && status === "error" && (
					<div className="flex flex-col items-center gap-3 py-8 px-4">
						<p className="text-sm text-muted-foreground text-center">
							{m.ui.fontPreviewsFailed}
						</p>
						<Button variant="outline" size="sm" onClick={handleRetry}>
							{m.ui.retry}
						</Button>
					</div>
				)}
				{tabFonts.length > 0 && filteredFonts.length === 0 && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						{m.ui.noFonts}
					</div>
				)}
				{(!isAllFonts || (status === "idle" && atlas)) &&
					filteredFonts.length > 0 && (
						<List
							rowCount={filteredFonts.length}
							rowHeight={ROW_HEIGHT}
							overscanCount={OVERSCAN}
							rowComponent={FontRow}
							rowProps={{
								atlas,
								filteredFonts,
								selectedFont: defaultValue,
								onFontSelect: handleSelect,
								favoriteFamilies,
								onToggleFavorite: handleToggleFavorite,
							}}
							style={{ height: listHeight, width: LIST_WIDTH }}
						/>
					)}
			</PopoverContent>
		</Popover>
	);
}

function FontSpritePreview({ entry }: { entry: FontAtlasEntry }) {
	return (
		<div
			className="shrink-0"
			style={{
				width: entry.w,
				height: ROW_HEIGHT,
				backgroundColor: "currentColor",
				WebkitMaskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				WebkitMaskPosition: `-${entry.x}px -${entry.y}px`,
				WebkitMaskRepeat: "no-repeat",
				maskImage: `url(/fonts/font-chunk-${entry.ch}.avif)`,
				maskPosition: `-${entry.x}px -${entry.y}px`,
				maskRepeat: "no-repeat",
				transform: `scale(${PREVIEW_SCALE})`,
				transformOrigin: "left center",
			}}
		/>
	);
}

type FontRowProps = {
	atlas: FontAtlas | null;
	filteredFonts: string[];
	selectedFont: string | undefined;
	onFontSelect: (params: { family: string }) => void;
	favoriteFamilies: Set<string>;
	onToggleFavorite: (params: { family: string }) => void;
};

function FontRow({
	index,
	style,
	atlas,
	filteredFonts,
	selectedFont,
	onFontSelect,
	favoriteFamilies,
	onToggleFavorite,
}: RowComponentProps<FontRowProps>) {
	const m = useMessages();
	const fontName = filteredFonts[index];
	// System, installed and bundled fonts have no sprite; render the name in the font itself
	const isBundled = isBundledFont(fontName);
	const entry = isBundled ? undefined : atlas?.fonts[fontName];
	const isSelected = fontName === selectedFont;
	const isFavorite = favoriteFamilies.has(fontName);

	return (
		<div
			style={style as CSSProperties}
			className={cn(
				"group flex w-full items-center hover:bg-popover-hover",
				isSelected && "bg-popover-hover",
			)}
		>
			<button
				type="button"
				className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 pl-3 outline-hidden"
				onClick={() => onFontSelect({ family: fontName })}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onFontSelect({ family: fontName });
					}
				}}
				aria-label={fontName}
			>
				<div className="min-w-0 overflow-hidden">
					{entry ? (
						<FontSpritePreview entry={entry} />
					) : (
						<span
							className="text-xl text-foreground/85"
							style={{ fontFamily: fontName }}
						>
							{isBundled ? `${fontName} 가나다` : fontName}
						</span>
					)}
				</div>
			</button>
			<button
				type="button"
				className={cn(
					"flex h-full shrink-0 cursor-pointer items-center px-3 text-muted-foreground outline-hidden hover:text-foreground focus-visible:text-foreground",
					!isFavorite &&
						"opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
				)}
				onClick={() => onToggleFavorite({ family: fontName })}
				aria-label={isFavorite ? m.ui.removeFromFavorites : m.ui.addToFavorites}
			>
				<Heart className={cn("size-3.5", isFavorite && "fill-current")} />
			</button>
		</div>
	);
}
