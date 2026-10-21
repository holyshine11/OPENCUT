import { buildStickerId, parseStickerId } from "../sticker-id";
import type {
	StickerBrowseResult,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";
import {
	EMOJI_STICKERS,
	toEmojiStickerSlug,
	type EmojiStickerCategory,
	type EmojiStickerEntry,
} from "./emoji-data";

const EMOJI_STICKERS_BASE_URL = "/stickers";

function buildEmojiUrl({
	category,
	slug,
}: {
	category: EmojiStickerCategory;
	slug: string;
}): string {
	return `${EMOJI_STICKERS_BASE_URL}/${category}/${encodeURIComponent(slug)}.svg`;
}

function toStickerItem({
	category,
	entry,
}: {
	category: EmojiStickerCategory;
	entry: EmojiStickerEntry;
}): StickerItem {
	const [name, koName] = entry;
	const slug = toEmojiStickerSlug({ name });
	return {
		id: buildStickerId({ providerId: category, providerValue: slug }),
		provider: category,
		name,
		previewUrl: buildEmojiUrl({ category, slug }),
		metadata: { koName },
	};
}

function matchesQuery({
	entry,
	query,
}: {
	entry: EmojiStickerEntry;
	query: string;
}): boolean {
	return entry.some((word) => word.toLowerCase().includes(query));
}

function createEmojiProvider({
	category,
}: {
	category: EmojiStickerCategory;
}): StickerProvider {
	const entries: readonly EmojiStickerEntry[] = EMOJI_STICKERS[category];
	return {
		id: category,
		async search({ query, options }): Promise<StickerSearchResult> {
			const normalizedQuery = query.trim().toLowerCase();
			const matched = entries.filter((entry) =>
				matchesQuery({ entry, query: normalizedQuery }),
			);
			const limit = options?.limit ?? matched.length;
			return {
				items: matched
					.slice(0, limit)
					.map((entry) => toStickerItem({ category, entry })),
				total: matched.length,
				hasMore: matched.length > limit,
			};
		},
		async browse({ options }): Promise<StickerBrowseResult> {
			const limit = options?.limit ?? entries.length;
			return {
				sections: [
					{
						id: "all",
						items: entries
							.slice(0, limit)
							.map((entry) => toStickerItem({ category, entry })),
						hasMore: entries.length > limit,
						layout: "grid",
					},
				],
			};
		},
		resolveUrl({ stickerId }): string {
			const { providerValue } = parseStickerId({ stickerId });
			return buildEmojiUrl({ category, slug: providerValue });
		},
	};
}

export const emojiProviders: StickerProvider[] = (
	Object.keys(EMOJI_STICKERS) as EmojiStickerCategory[]
).map((category) => createEmojiProvider({ category }));
