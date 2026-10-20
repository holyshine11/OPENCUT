/**
 * Builds public/sounds/manifest.json from the audio files in public/sounds.
 * Re-run after adding or removing bundled sound effects.
 *
 * Run: bun scripts/generate-sound-manifest.ts
 * Deps: ffprobe on PATH
 */

import { execFileSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUNDS_DIR = join(__dirname, "..", "public", "sounds");
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".aac"]);

function probeDuration(path: string): number {
	const out = execFileSync("ffprobe", [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		path,
	]);
	return Number.parseFloat(out.toString().trim()) || 0;
}

const sounds = readdirSync(SOUNDS_DIR)
	.filter((file) => AUDIO_EXTENSIONS.has(extname(file).toLowerCase()))
	.sort((a, b) => a.localeCompare(b, "ko"))
	.map((file) => {
		const path = join(SOUNDS_DIR, file);
		return {
			file,
			name: parse(file).name,
			duration: Math.round(probeDuration(path) * 1000) / 1000,
			size: statSync(path).size,
		};
	});

writeFileSync(
	join(SOUNDS_DIR, "manifest.json"),
	`${JSON.stringify(sounds, null, "\t")}\n`,
);
console.log(`Wrote ${sounds.length} sounds to manifest.json`);
