"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useMessages } from "@/i18n";
import { cn } from "@/utils/ui";
import type { EditBrief } from "../brief";
import { FORMAT_IDS } from "../plan";
import { runAiEdit, startAiEdit } from "../run";
import { AiEffortSelect, AiModelSelect } from "./ai-model-select";
import { AI_EDIT_SCOPE_IDS, AI_EDIT_STEPS, type AiEditScope, useAiEditStore } from "../store";

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
			<AiEffortSelect className="w-auto" disabled={status === "running"} />
			<Button variant="outline" disabled={status === "running"} onClick={startAiEdit}>
				<Sparkles />
				{m.aiEdit.button}
			</Button>
			{status !== "idle" && <AiEditOverlay />}
		</>
	);
}

/**
 * AI가 편집하는 동안 화면 전체를 어둡게 덮고 진행 상황을 가운데에 띄운다. 편집 취소 말고는 누르거나 단축키를 쓸 수 없다.
 * 편집 도중 사람이 타임라인을 건드리면 계획과 어긋나기 때문이다
 */
function AiEditOverlay() {
	const m = useMessages();
	const job = useAiEditStore((state) => state.job);
	const cardRef = useRef<HTMLDivElement>(null);
	const logRef = useRef<HTMLDivElement>(null);
	const logLength = "log" in job ? job.log.length : 0;
	const choosing = job.status === "choosing";

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
	const scope = "scope" in job ? job.scope : null;
	const briefing = job.status === "running" && job.briefing === true;
	const steps = briefing
		? [m.aiEdit.briefStep]
		: scope === "all"
			? m.aiEdit.reviseSteps
			: scope
				? [m.aiEdit.scopes[scope]]
				: [m.aiEdit.step1, m.aiEdit.step2, m.aiEdit.step3, m.aiEdit.step4, m.aiEdit.step5];
	const currentStep = job.status === "running" ? job.step : job.status === "done" ? AI_EDIT_STEPS + 1 : 0;

	return createPortal(
		<div className="fixed inset-0 z-200 flex items-center justify-center bg-black/60 p-4">
			<div
				ref={cardRef}
				role="dialog"
				aria-modal="true"
				aria-label={m.aiEdit.button}
				tabIndex={-1}
				className={cn(
					"bg-background flex max-h-[85vh] max-w-full flex-col gap-3 rounded-lg border p-4 shadow-xl outline-none",
					job.status === "reviewing" ? "w-[40rem]" : "w-[26rem]",
				)}
			>
				<div className="flex items-center gap-2 text-sm font-medium">
					{job.status === "running" && <Spinner />}
					{choosing && m.aiEdit.chooseScope}
					{job.status === "running" &&
						(briefing ? m.aiEdit.runningBrief : scope ? m.aiEdit.runningRevise : m.aiEdit.running)}
					{job.status === "reviewing" && m.aiEdit.reviewTitle}
					{job.status === "done" && m.aiEdit.done}
					{job.status === "failed" && <span className="text-destructive">{m.aiEdit.failed}</span>}
				</div>

				{choosing && <ScopePicker onCancel={close} />}

				{(job.status === "running" || job.status === "done") && (
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

				{job.status === "reviewing" && <BriefReview brief={job.brief} onCancel={close} />}

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

				{(job.status === "running" || job.status === "failed") && (
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
					!choosing && job.status !== "reviewing" && <Button onClick={close}>{m.aiEdit.close}</Button>
				)}
			</div>
		</div>,
		document.body,
	);
}

/** 지난 AI 편집에서 다듬을 범위를 고르고 요청을 적는다. 확인을 눌러야 시작한다(잘못 눌러 사용량이 드는 걸 막는다) */
function ScopePicker({ onCancel }: { onCancel: () => void }) {
	const m = useMessages();
	const [scope, setScope] = useState<AiEditScope | null>(null);
	const [guide, setGuide] = useState("");
	if (!scope) {
		return (
			<>
				<p className="text-muted-foreground text-xs">{m.aiEdit.chooseScopeHint}</p>
				<div className="flex flex-col gap-1.5 overflow-y-auto">
					{AI_EDIT_SCOPE_IDS.map((id) => (
						<Button
							key={id}
							variant="outline"
							className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
							onClick={() => setScope(id)}
						>
							{m.aiEdit.scopes[id]}
							<span className="text-muted-foreground text-xs font-normal">{m.aiEdit.scopeHints[id]}</span>
						</Button>
					))}
				</div>
				<Button variant="ghost" onClick={onCancel}>
					{m.aiEdit.cancel}
				</Button>
			</>
		);
	}
	return (
		<>
			<div className="flex flex-col gap-0.5 text-sm">
				<span className="font-medium">{m.aiEdit.scopes[scope]}</span>
				<span className="text-muted-foreground text-xs">{m.aiEdit.scopeHints[scope]}</span>
			</div>
			{/* 음성만 다시는 Claude를 부르지 않으니 요청을 받지 않는다 */}
			{scope !== "revoice" && (
				<label className="flex flex-col gap-1">
					<span className="text-xs font-medium">{m.aiEdit.guideLabel}</span>
					<Textarea
						rows={5}
						value={guide}
						placeholder={m.aiEdit.guidePlaceholder}
						onChange={(event) => setGuide(event.target.value)}
					/>
				</label>
			)}
			<Button onClick={() => void runAiEdit({ scope, guide })}>{m.aiEdit.confirmScope}</Button>
			<Button variant="ghost" onClick={() => setScope(null)}>
				{m.aiEdit.backToScopes}
			</Button>
		</>
	);
}

/** AI가 낸 기획안을 사용자가 고치고 인터뷰에 답한다. 확정하면 이 내용대로 본 편집을 이어 간다 */
function BriefReview({ brief, onCancel }: { brief: EditBrief; onCancel: () => void }) {
	const m = useMessages();
	const [draft, setDraft] = useState(brief);
	const fields = (["recipe", "flow", "points", "funny"] as const).map((key) => ({ key, label: m.aiEdit.briefFields[key] }));
	return (
		<>
			<p className="text-muted-foreground text-xs">{m.aiEdit.reviewHint}</p>
			<div className="flex flex-col gap-3 overflow-y-auto pr-1 text-sm">
				<label className="flex flex-col gap-1">
					<span className="text-muted-foreground text-xs">{m.aiEdit.briefFields.title}</span>
					<Textarea
						rows={2}
						value={draft.title}
						onChange={(event) => setDraft({ ...draft, title: event.target.value })}
					/>
				</label>
				{fields.map(({ key, label }) => (
					<label key={key} className="flex flex-col gap-1">
						<span className="text-muted-foreground text-xs">{label}</span>
						<Textarea
							rows={key === "recipe" ? 8 : 4}
							value={draft[key]}
							onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
						/>
					</label>
				))}
				{draft.questions.length > 0 && (
					<div className="flex flex-col gap-2">
						<span className="text-xs font-medium">{m.aiEdit.interview}</span>
						{draft.questions.map((item, index) => (
							<label key={item.question} className="flex flex-col gap-1">
								<span className="text-xs">{item.question}</span>
								<Input
									value={item.answer}
									placeholder={m.aiEdit.answerPlaceholder}
									onChange={(event) =>
										setDraft({
											...draft,
											questions: draft.questions.map((question, at) =>
												at === index ? { ...question, answer: event.target.value } : question,
											),
										})
									}
								/>
							</label>
						))}
					</div>
				)}
			</div>
			<Button onClick={() => void runAiEdit({ brief: draft })}>{m.aiEdit.confirmBrief}</Button>
			<Button variant="ghost" onClick={onCancel}>
				{m.aiEdit.cancel}
			</Button>
		</>
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
