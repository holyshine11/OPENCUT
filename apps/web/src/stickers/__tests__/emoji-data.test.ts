import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EMOJI_STICKERS, toEmojiStickerSlug } from "../providers/emoji-data";

const PUBLIC_STICKERS = join(import.meta.dir, "..", "..", "..", "public", "stickers");

describe("emoji stickers", () => {
	test("목록의 스티커마다 public/stickers에 파일이 있고 id가 겹치지 않는다", () => {
		const missing: string[] = [];
		for (const [category, entries] of Object.entries(EMOJI_STICKERS)) {
			const slugs = entries.map(([name]) => toEmojiStickerSlug({ name }));
			expect(new Set(slugs).size).toBe(slugs.length);
			for (const slug of slugs) {
				if (!existsSync(join(PUBLIC_STICKERS, category, `${slug}.svg`))) {
					missing.push(`${category}/${slug}`);
				}
			}
		}
		expect(missing).toEqual([]);
	});
});
