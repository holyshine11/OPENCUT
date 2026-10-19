import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useMessages } from "@/i18n";

export function DeleteProjectDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	projectNames,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	projectNames: string[];
}) {
	const m = useMessages();
	const count = projectNames.length;
	const isSingle = count === 1;
	const singleName = isSingle ? projectNames[0] : null;

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						{singleName ? (
							<>
								{m.dialogs.deleteProject.titleBeforeName}
								<span className="inline-block max-w-[300px] truncate align-bottom">
									{singleName}
								</span>
								{m.dialogs.deleteProject.titleAfterName}
							</>
						) : (
							m.dialogs.deleteProject.titleMany({ count })
						)}
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<Alert variant="destructive">
						<AlertTitle>{m.dialogs.deleteProject.warning}</AlertTitle>
						<AlertDescription>
							{singleName
								? m.dialogs.deleteProject.bodySingle({ name: singleName })
								: m.dialogs.deleteProject.bodyMany({ count })}
						</AlertDescription>
					</Alert>
					<div className="flex flex-col gap-3">
						<Label className="text-xs font-semibold text-slate-500">
							{m.dialogs.deleteProject.typeToConfirm}
						</Label>
						<Input
							type="text"
							placeholder="DELETE"
							size="lg"
							variant="destructive"
						/>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{m.dialogs.cancel}
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						{m.dialogs.deleteProject.confirm}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
