"use client";

import { translateLabel, useMessages } from "@/i18n";

/** SVG <title> in the current UI language; the label is the English text used as the labels key */
export function IconTitle({ label }: { label: string }) {
	const messages = useMessages();
	return <title>{translateLabel({ messages, label })}</title>;
}
