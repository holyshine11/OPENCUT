import { create } from "zustand";
import { persist } from "zustand/middleware";

// 하트를 누른 조정 프리셋 id. 누른 순서대로 앞에 보여 준다
interface AdjustFavoritesState {
	favorites: string[];
	toggle: ({ presetId }: { presetId: string }) => void;
}

export const useAdjustFavorites = create<AdjustFavoritesState>()(
	persist(
		(set) => ({
			favorites: [],
			toggle: ({ presetId }) =>
				set((state) => ({
					favorites: state.favorites.includes(presetId)
						? state.favorites.filter((id) => id !== presetId)
						: [...state.favorites, presetId],
				})),
		}),
		{ name: "adjust-preset-favorites" },
	),
);
