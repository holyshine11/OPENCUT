"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEditor } from "@/editor/use-editor";
import { Loader2 } from "lucide-react";
import { useMessages } from "@/i18n";

export function MigrationDialog() {
	const m = useMessages();
	const editor = useEditor();
	const migrationState = editor.project.getMigrationState();

	if (!migrationState.isMigrating) return null;

	const title = migrationState.projectName
		? m.dialogs.migration.updatingProject
		: m.dialogs.migration.updatingProjects;
	const description = migrationState.projectName
		? m.dialogs.migration.upgradingProject({
				name: migrationState.projectName,
				from: migrationState.fromVersion,
				to: migrationState.toVersion,
			})
		: m.dialogs.migration.upgradingProjects({
				from: migrationState.fromVersion,
				to: migrationState.toVersion,
			});

	return (
		<Dialog open={true}>
			<DialogContent
				className="sm:max-w-md"
				onPointerDownOutside={(event) => event.preventDefault()}
				onEscapeKeyDown={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-center py-4">
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
				</div>
			</DialogContent>
		</Dialog>
	);
}
