"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { LOCALES, useLocaleStore, useMessages } from "./index";

export function LanguageSelect({ className }: { className?: string }) {
	const m = useMessages();
	const locale = useLocaleStore((state) => state.locale);
	const setLocale = useLocaleStore((state) => state.setLocale);

	return (
		<Select
			value={locale}
			onValueChange={(value) => {
				const next = LOCALES.find((candidate) => candidate === value);
				if (next) setLocale(next);
			}}
		>
			<SelectTrigger className={className} aria-label={m.language.label}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{LOCALES.map((candidate) => (
					<SelectItem key={candidate} value={candidate}>
						{m.language[candidate]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
