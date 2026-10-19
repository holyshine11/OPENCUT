export function formatDate({
	date,
	locale = "en-US",
}: {
	date: Date;
	locale?: string;
}): string {
	return date.toLocaleDateString(locale, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
