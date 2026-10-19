"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { en, type Messages } from "./messages/en";
import { ko } from "./messages/ko";

export type Locale = "ko" | "en";
export const LOCALES: Locale[] = ["ko", "en"];
const MESSAGES: Record<Locale, Messages> = { ko, en };

interface LocaleState {
	locale: Locale;
	setLocale: (locale: Locale) => void;
}

// 기본은 한국어. 서버 렌더링과 어긋나지 않게 저장된 값은 LocaleSync가 마운트 뒤에 읽는다
export const useLocaleStore = create<LocaleState>()(
	persist(
		(set) => ({
			locale: "ko",
			setLocale: (locale) => set({ locale }),
		}),
		{ name: "ui-locale", skipHydration: true },
	),
);

export function useMessages(): Messages {
	return MESSAGES[useLocaleStore((state) => state.locale)];
}

/** React 밖(토스트를 띄우는 서비스 코드 등)에서 쓰는 현재 언어 문구 */
export function getMessages(): Messages {
	return MESSAGES[useLocaleStore.getState().locale];
}

export function LocaleSync() {
	const locale = useLocaleStore((state) => state.locale);
	useEffect(() => {
		void useLocaleStore.persist.rehydrate();
	}, []);
	useEffect(() => {
		document.documentElement.lang = locale;
	}, [locale]);
	return null;
}
