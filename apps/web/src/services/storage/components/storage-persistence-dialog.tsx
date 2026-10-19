"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useStoragePersistence } from "@/services/storage/use-storage-persistence";
import { useMessages } from "@/i18n";

export function StoragePersistenceDialog() {
	const m = useMessages();
	const { showDialog, onConfirm, onDismiss } = useStoragePersistence();

	return (
		<Dialog open={showDialog} onOpenChange={(open) => !open && onDismiss()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{m.dialogs.storage.title}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<p className="text-base text-muted-foreground">
						{m.dialogs.storage.body}
					</p>
					<p className="text-base text-muted-foreground">
						{m.dialogs.storage.question}
					</p>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={onDismiss}>
						{m.dialogs.storage.notNow}
					</Button>
					<Button onClick={onConfirm}>{m.dialogs.storage.allow}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
