"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useMessages } from "@/i18n";
import { cn } from "@/utils/ui";
import { FORMAT_IDS } from "../plan";
import { runAiEdit } from "../run";
import { AiModelSelect } from "./ai-model-select";
import { AI_EDIT_STEPS, useAiEditStore } from "../store";

export function AiEditButton() {
	const m = useMessages();
	const status = useAiEditStore((state) => state.job.status);
	const format = useAiEditStore((state) => state.format);
	const setFormat = useAiEditStore((state) => state.setFormat);
	return (
		<>
			<Select value={format} onValueChange={setFormat} disabled={status === "running"}>
				<SelectTrigger aria-label={m.aiEdit.format} className="w-auto">
					<SelectValue>{m.aiEdit.formats[format]}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{FORMAT_IDS.map((id) => (
						<SelectItem key={id} value={id}>
							{m.aiEdit.formats[id]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<AiModelSelect className="w-auto" disabled={status === "running"} />
			<Button variant="outline" disabled={status === "running"} onClick={() => void runAiEdit()}>
				<Sparkles />
				{m.aiEdit.button}
			</Button>
			{status !== "idle" && <AiEditOverlay />}
		</>
	);
}

/**
 * AI가 편집하는 동안 화면 전체를 덮는다. 뒤의 타임라인은 비쳐 보이지만 누르거나 단축키를 쓸 수 없다.
 * 편집 도중 사람이 타임라인을 건드리면 계획과 어긋나기 때문이다
 */
function AiEditOverlay() {
	const m = useMessages();
	const job = useAiEditStore((state) => state.job);
	const cardRef = useRef<HTMLDivElement>(null);
	const logRef = useRef<HTMLDivElement>(null);
	const logLength = "log" in job ? job.log.length : 0;

	useEffect(() => {
		// 편집기 단축키는 window에서 듣는다. 캡처 단계에서 먼저 잡아 카드 밖의 키 입력을 버린다
		const block = (event: KeyboardEvent) => {
			if (event.target instanceof Node && cardRef.current?.contains(event.target)) return;
			event.stopPropagation();
			event.preventDefault();
		};
		window.addEventListener("keydown", block, true);
		cardRef.current?.focus();
		return () => window.removeEventListener("keydown", block, true);
	}, []);

	useEffect(() => {
		if (logLength > 0) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
	}, [logLength]);

	if (job.status === "idle") return null;
	const close = () => useAiEditStore.setState({ job: { status: "idle" } });
	const steps = [m.aiEdit.step1, m.aiEdit.step2, m.aiEdit.step3, m.aiEdit.step4, m.aiEdit.step5];
	const currentStep = job.status === "running" ? job.step : job.status === "done" ? AI_EDIT_STEPS + 1 : 0;

	return createPortal(
		<div className="fixed inset-0 z-200 flex items-end justify-end bg-black/30 p-4">
			<div
				ref={cardRef}
				role="dialog"
				aria-modal="true"
				aria-label={m.aiEdit.button}
				tabIndex={-1}
				className="bg-background flex max-h-[85vh] w-[26rem] max-w-full flex-col gap-3 rounded-lg border p-4 shadow-xl outline-none"
			>
				<div className="flex items-center gap-2 text-sm font-medium">
					{job.status === "running" && <Spinner />}
					{job.status === "running" && m.aiEdit.running}
					{job.status === "done" && m.aiEdit.done}
					{job.status === "failed" && <span className="text-destructive">{m.aiEdit.failed}</span>}
				</div>

				{job.status !== "failed" && (
					<ol className="flex flex-col gap-1 text-sm">
						{steps.map((label, index) => {
							const step = index + 1;
							return (
								<li
									key={label}
									aria-current={step === currentStep ? "step" : undefined}
									className={cn(
										"flex items-center gap-2",
										step > currentStep && "text-muted-foreground",
										step === currentStep && "font-medium",
									)}
								>
									<span className="flex size-4 items-center justify-center">
										{step < currentStep ? <Check className="size-4" /> : step === currentStep ? <Spinner /> : null}
									</span>
									{step}. {label}
								</li>
							);
						})}
					</ol>
				)}

				{job.status === "failed" && <p className="text-destructive text-sm">{job.error}</p>}

				{job.status === "done" && (
					<div className="flex flex-col gap-2 overflow-y-auto text-sm">
						<p>{job.plan.concept}</p>
						<CopyField label={m.aiEdit.ytTitle} value={job.plan.youtube.title} />
						<CopyField label={m.aiEdit.ytDescription} value={job.plan.youtube.description} />
						<CopyField label={m.aiEdit.ytTags} value={job.plan.youtube.tags.join(", ")} />
						{job.plan.review.length > 0 && (
							<ul className="text-muted-foreground list-disc pl-4 text-xs">
								{job.plan.review.map((note) => (
									<li key={note}>{note}</li>
								))}
							</ul>
						)}
						<p className="text-muted-foreground text-xs">{m.aiEdit.undoHint}</p>
					</div>
				)}

				{job.status !== "done" && (
					<div
						ref={logRef}
						aria-live="polite"
						className="bg-muted/50 text-muted-foreground h-48 overflow-y-auto rounded-md p-2 text-xs whitespace-pre-wrap"
					>
						{job.log.join("\n")}
					</div>
				)}

				{job.status === "running" ? (
					<>
						<p className="text-muted-foreground text-xs">{m.aiEdit.lockedHint}</p>
						<Button variant="outline" onClick={() => job.abort.abort()}>
							{m.aiEdit.cancel}
						</Button>
					</>
				) : (
					<Button onClick={close}>{m.aiEdit.close}</Button>
				)}
			</div>
		</div>,
		document.body,
	);
}

function CopyField({ label, value }: { label: string; value: string }) {
	const m = useMessages();
	if (!value) return null;
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs">{label}</span>
				<Button
					size="icon"
					variant="ghost"
					className="size-6"
					aria-label={`${label} ${m.aiEdit.copy}`}
					onClick={() => {
						void navigator.clipboard.writeText(value);
						toast.success(m.aiEdit.copied);
					}}
				>
					<Copy className="size-3.5" />
				</Button>
			</div>
			<p className="bg-muted/50 rounded-md p-2 text-xs whitespace-pre-wrap select-text">{value}</p>
		</div>
	);
}
