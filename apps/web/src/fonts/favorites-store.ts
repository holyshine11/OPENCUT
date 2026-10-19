import { create } from "zustand";
import { persist } from "zustand/middleware";

// 즐겨찾기한 글꼴. 설치된 글꼴인지도 같이 적어 두어야 고를 때 Google 글꼴로 잘못 불러오지 않는다
export interface FavoriteFont {
	family: string;
	isLocal: boolean;
}

interface FontFavoritesState {
	favorites: FavoriteFont[];
	toggle: (font: FavoriteFont) => void;
}

export const useFontFavorites = create<FontFavoritesState>()(
	persist(
		(set) => ({
			favorites: [],
			toggle: (font) =>
				set((state) => ({
					favorites: state.favorites.some(
						(favorite) => favorite.family === font.family,
					)
						? state.favorites.filter(
								(favorite) => favorite.family !== font.family,
							)
						: [...state.favorites, font],
				})),
		}),
		{ name: "font-favorites" },
	),
);
