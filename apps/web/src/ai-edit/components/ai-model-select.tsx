"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMessages } from "@/i18n";
import { AI_EDIT_EFFORTS, AI_EDIT_MODELS } from "../models";
import { useAiEditStore } from "../store";

/** AI 자동 편집에 쓸 Claude 모델 고르기. 닫혀 있을 땐 이름만, 펼치면 모델마다 한 줄 설명이 붙는다 */
export function AiModelSelect({ className, disabled }: { className?: string; disabled?: boolean }) {
	const m = useMessages();
	const model = useAiEditStore((state) => state.model);
	const setModel = useAiEditStore((state) => state.setModel);
	return (
		<Select value={model} onValueChange={setModel} disabled={disabled}>
			<SelectTrigger aria-label={m.aiEdit.model} className={className}>
				<SelectValue>{AI_EDIT_MODELS.find((item) => item.id === model)?.name}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{AI_EDIT_MODELS.map((item) => (
					<SelectItem key={item.id} value={item.id}>
						{item.name}
						<span className="text-muted-foreground ml-2 text-xs">{m.aiEdit.modelHints[item.id]}</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

/** 추론 강도 고르기. 닫혀 있을 땐 이름만, 펼치면 한 줄 설명이 붙는다 */
export function AiEffortSelect({ className, disabled }: { className?: string; disabled?: boolean }) {
	const m = useMessages();
	const effort = useAiEditStore((state) => state.effort);
	const setEffort = useAiEditStore((state) => state.setEffort);
	return (
		<Select value={effort} onValueChange={setEffort} disabled={disabled}>
			<SelectTrigger aria-label={m.aiEdit.effort} className={className}>
				<SelectValue>{m.aiEdit.efforts[effort]}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{AI_EDIT_EFFORTS.map((item) => (
					<SelectItem key={item} value={item}>
						{m.aiEdit.efforts[item]}
						<span className="text-muted-foreground ml-2 text-xs">{m.aiEdit.effortHints[item]}</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
