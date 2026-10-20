"use client";

import { Heart } from "lucide-react";
import { useAdjustFavorites } from "@/effects/adjust-favorites-store";
import { useMessages } from "@/i18n";
import { cn } from "@/utils/ui";

export function AdjustFavoriteButton({
	presetId,
	className,
}: {
	presetId: string;
	className?: string;
}) {
	const m = useMessages();
	const isFavorite = useAdjustFavorites((state) =>
		state.favorites.includes(presetId),
	);
	const toggle = useAdjustFavorites((state) => state.toggle);
	const label = isFavorite ? m.ui.removeFromFavorites : m.ui.addToFavorites;

	return (
		<button
			type="button"
			draggable={false}
			aria-label={label}
			aria-pressed={isFavorite}
			title={label}
			className={cn(
				"absolute top-1 left-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white outline-hidden transition-opacity hover:bg-black/60 focus-visible:opacity-100",
				isFavorite
					? "text-rose-500 opacity-100"
					: "opacity-0 group-hover:opacity-100",
				className,
			)}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				toggle({ presetId });
			}}
		>
			<Heart className={cn("size-3", isFavorite && "fill-current")} />
		</button>
	);
}
