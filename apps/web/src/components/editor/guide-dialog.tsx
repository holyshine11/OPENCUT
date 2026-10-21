"use client";

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useMessages } from "@/i18n";

export function GuideDialog({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const m = useMessages();

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[80vh] max-w-2xl flex-col p-0">
				<DialogHeader>
					<DialogTitle>{m.guide.title}</DialogTitle>
				</DialogHeader>

				<DialogBody className="scrollbar-thin grow overflow-y-auto">
					<div className="flex flex-col gap-5">
						<p className="text-muted-foreground text-sm">{m.guide.intro}</p>
						{m.guide.sections.map((section) => (
							<section key={section.title} className="flex flex-col gap-1.5">
								<h3 className="text-sm font-semibold">{section.title}</h3>
								<ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-sm">
									{section.items.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</section>
						))}
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
