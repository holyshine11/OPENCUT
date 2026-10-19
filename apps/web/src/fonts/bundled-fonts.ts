// 앱에 포함된 OFL 한글 폰트. 인터넷 없이 쓰고, 렌더링·내보내기 결과가 항상 같게 하려고 시작할 때 모두 로드한다.
// 라이선스: public/fonts/bundled/LICENSE.md
const BUNDLED_FONT_PATH_PREFIX = "/fonts/bundled/";

const BUNDLED_FONTS: ReadonlyArray<{
	family: string;
	files: Readonly<Record<number, string>>;
}> = [
	{ family: "Pretendard", files: { 400: "Pretendard-Regular.woff2", 700: "Pretendard-Bold.woff2" } },
	{ family: "Noto Sans KR", files: { 400: "NotoSansKR-Regular.woff2", 700: "NotoSansKR-Bold.woff2" } },
	{ family: "Nanum Gothic", files: { 400: "NanumGothic-Regular.woff2", 700: "NanumGothic-Bold.woff2" } },
	{ family: "NanumSquareRound", files: { 400: "NanumSquareRound-Regular.woff2", 700: "NanumSquareRound-Bold.woff2" } },
	{ family: "Gowun Dodum", files: { 400: "GowunDodum-Regular.woff2" } },
	{ family: "Black Han Sans", files: { 400: "BlackHanSans-Regular.woff2" } },
	{ family: "Do Hyeon", files: { 400: "DoHyeon-Regular.woff2" } },
	{ family: "Jua", files: { 400: "Jua-Regular.woff2" } },
	{ family: "Nanum Pen Script", files: { 400: "NanumPenScript-Regular.woff2" } },
];

export const BUNDLED_FONT_FAMILIES = BUNDLED_FONTS.map((font) => font.family);

const bundledFamilySet = new Set(BUNDLED_FONT_FAMILIES);

export function isBundledFont(family: string): boolean {
	return bundledFamilySet.has(family);
}

let loadPromise: Promise<void> | null = null;

export function loadBundledFonts(): Promise<void> {
	if (loadPromise) return loadPromise;

	const faces = BUNDLED_FONTS.flatMap(({ family, files }) =>
		Object.entries(files).map(
			([weight, file]) =>
				new FontFace(family, `url(${BUNDLED_FONT_PATH_PREFIX}${file})`, {
					weight,
				}),
		),
	);
	loadPromise = Promise.all(
		faces.map(async (face) => {
			try {
				document.fonts.add(await face.load());
			} catch (error) {
				console.error(`Failed to load bundled font ${face.family}:`, error);
			}
		}),
	).then(() => undefined);

	return loadPromise;
}
