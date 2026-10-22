// 설치된 글꼴은 로컬 서버(/api/local-fonts)가 macOS에서 읽어 준다. 브라우저 API(queryLocalFonts)는
// Chrome에만 있고, Safari는 사용자가 설치한 글꼴을 웹페이지에 막아 두어 파일을 직접 받아 등록한다
const LOCAL_FONTS_API = "/api/local-fonts";

interface LocalFontFace {
	file: string;
	weight: number;
	italic: boolean;
}

type LocalFontCatalog = Record<string, LocalFontFace[]>;

let catalogPromise: Promise<LocalFontCatalog> | null = null;
const loaded = new Map<string, Promise<void>>();

function loadCatalog(): Promise<LocalFontCatalog> {
	catalogPromise ??= fetch(LOCAL_FONTS_API).then((response) => {
		if (!response.ok)
			throw new Error(`Local fonts unavailable: ${response.status}`);
		return response.json();
	});
	// 실패는 기억하지 않고 다음에 다시 묻는다
	catalogPromise.catch(() => {
		catalogPromise = null;
	});
	return catalogPromise;
}

export async function queryLocalFontFamilies(): Promise<string[]> {
	return Object.keys(await loadCatalog()).sort((a, b) => a.localeCompare(b));
}

/** 설치된 글꼴이면 등록하고 true, 아니면 false */
export async function loadLocalFont({
	family,
}: {
	family: string;
}): Promise<boolean> {
	const faces = (await loadCatalog().catch(() => null))?.[family];
	if (!faces) return false;
	if (!loaded.has(family)) {
		loaded.set(
			family,
			Promise.allSettled(
				faces.map(async ({ file, weight, italic }) => {
					const face = new FontFace(
						family,
						`url(${LOCAL_FONTS_API}?file=${encodeURIComponent(file)})`,
						{ weight: String(weight), style: italic ? "italic" : "normal" },
					);
					document.fonts.add(await face.load());
				}),
			).then(() => undefined),
		);
	}
	await loaded.get(family);
	return true;
}
