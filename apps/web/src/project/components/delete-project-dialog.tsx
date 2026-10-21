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
import { useState } from "react";

const CONFIRM_WORD = "DELETE";

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
	// 다이얼로그가 열릴 때마다 비운다. 지난번에 입력한 DELETE가 남아 있으면 확인 절차가 무의미해진다
	const [typed, setTyped] = useState("");
	const [wasOpen, setWasOpen] = useState(isOpen);
	if (isOpen !== wasOpen) {
		setWasOpen(isOpen);
		if (isOpen) setTyped("");
	}

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
							placeholder={CONFIRM_WORD}
							size="lg"
							variant="destructive"
							value={typed}
							onChange={(event) => setTyped(event.target.value)}
						/>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{m.dialogs.cancel}
					</Button>
					<Button
						variant="destructive"
						disabled={typed !== CONFIRM_WORD}
						onClick={onConfirm}
					>
						{m.dialogs.deleteProject.confirm}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
