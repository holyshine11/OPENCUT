// Local Font Access API (Chromium only). Not in TS DOM lib yet.
declare global {
	interface Window {
		queryLocalFonts?: () => Promise<Array<{ family: string }>>;
	}
}

let cachedFamilies: string[] | null = null;

export function isLocalFontAccessSupported(): boolean {
	return typeof window !== "undefined" && !!window.queryLocalFonts;
}

/** Must be called from a user gesture the first time (permission prompt). */
export async function queryLocalFontFamilies(): Promise<string[]> {
	if (cachedFamilies) return cachedFamilies;
	if (!window.queryLocalFonts) throw new Error("Local Font Access unsupported");
	const fonts = await window.queryLocalFonts();
	cachedFamilies = [...new Set(fonts.map((font) => font.family))].sort(
		(a, b) => a.localeCompare(b),
	);
	return cachedFamilies;
}
