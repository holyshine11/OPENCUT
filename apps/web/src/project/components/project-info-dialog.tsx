import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { TProjectMetadata } from "@/project/types";
import { formatDate } from "@/utils/date";
import { formatTimecode, mediaTimeToSeconds } from "opencut-wasm";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/i18n";

function InfoRow({
	label,
	value,
}: {
	label: string;
	value: string | React.ReactNode;
}) {
	return (
		<div className="flex justify-between items-center py-0 last:pb-0">
			<span className="text-muted-foreground text-sm">{label}</span>
			<span className="text-sm font-medium">{value}</span>
		</div>
	);
}

export function ProjectInfoDialog({
	isOpen,
	onOpenChange,
	project,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	project: TProjectMetadata;
}) {
	const m = useMessages();
	const durationSeconds = mediaTimeToSeconds({ time: project.duration });
	const durationFormatted =
		project.duration > 0
		? (formatTimecode({ time: project.duration, format: durationSeconds >= 3600 ? "HH:MM:SS" : "MM:SS" }) ?? "")
		: "0:00";

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
				<DialogHeader>
					<DialogTitle className="truncate max-w-[350px]">
						{project.name}
					</DialogTitle>
				</DialogHeader>

				<DialogBody className="flex flex-col">
					<InfoRow label={m.projects.sortBy.duration} value={durationFormatted} />
					<InfoRow
						label={m.projects.sortBy.createdAt}
						value={formatDate({ date: project.createdAt })}
					/>
					<InfoRow
						label={m.projects.sortBy.updatedAt}
						value={formatDate({ date: project.updatedAt })}
					/>
					<InfoRow
						label={m.dialogs.projectInfo.projectId}
						value={
							<code className="text-xs bg-muted px-1.5 py-0.5 rounded">
								{project.id.slice(0, 8)}
							</code>
						}
					/>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{m.dialogs.projectInfo.close}
					</Button>
					<Button onClick={() => onOpenChange(false)}>
						{m.dialogs.projectInfo.done}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
