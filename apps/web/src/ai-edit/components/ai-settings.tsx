"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader, SectionTitle } from "@/components/section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMessages } from "@/i18n";
import { AI_EDIT_MODELS } from "../models";
import { useAiEditStore } from "../store";

type Account =
	| { status: "loading" }
	| { status: "ready"; loggedIn: boolean; plan: string | null; expiresAt: string | null }
	| { status: "error"; error: string };

async function fetchAccount(): Promise<Account> {
	try {
		const response = await fetch("/api/ai-edit", { cache: "no-store" });
		const body = await response.json();
		return response.ok ? { status: "ready", ...body } : { status: "error", error: body.error };
	} catch (error) {
		return { status: "error", error: error instanceof Error ? error.message : String(error) };
	}
}

/** 설정의 AI 탭: AI 자동 편집에 쓸 Claude 모델과 구독 로그인 상태 */
export function AiSettings() {
	const m = useMessages();
	const model = useAiEditStore((state) => state.model);
	const setModel = useAiEditStore((state) => state.setModel);
	const [account, setAccount] = useState<Account>({ status: "loading" });

	useEffect(() => {
		void fetchAccount().then(setAccount);
	}, []);

	const refresh = () => {
		setAccount({ status: "loading" });
		void fetchAccount().then(setAccount);
	};

	const login = async () => {
		const response = await fetch("/api/ai-edit?action=login", { method: "POST" });
		if (response.ok) toast(m.aiEdit.loginOpened);
		else toast.error((await response.json().catch(() => null))?.error ?? m.aiEdit.failed);
	};

	return (
		<div className="flex flex-col">
			<Section showTopBorder={false}>
				<SectionHeader className="justify-between">
					<SectionTitle className="flex-1">{m.aiEdit.model}</SectionTitle>
					<Select value={model} onValueChange={setModel}>
						<SelectTrigger aria-label={m.aiEdit.model} className="h-auto border-none bg-transparent p-1">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{AI_EDIT_MODELS.map((item) => (
								<SelectItem key={item.id} value={item.id}>
									{item.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SectionHeader>
			</Section>
			<div className="flex flex-col gap-3 px-3 py-3 text-sm">
				<p className="text-muted-foreground text-xs">{m.aiEdit.modelHint}</p>
				<div aria-live="polite">
					{account.status === "loading" && <p className="text-muted-foreground">{m.aiEdit.accountChecking}</p>}
					{account.status === "error" && <p className="text-destructive">{account.error}</p>}
					{account.status === "ready" &&
						(account.loggedIn ? (
							<p>
								{m.aiEdit.loggedIn({ plan: account.plan ?? "" })}
								{account.expiresAt && (
									<span className="text-muted-foreground block text-xs">
										{m.aiEdit.loginExpires({
											date: new Date(account.expiresAt).toLocaleDateString(m.dateLocale),
										})}
									</span>
								)}
							</p>
						) : (
							<p className="text-destructive">{m.aiEdit.loggedOut}</p>
						))}
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => void login()}>
						{m.aiEdit.login}
					</Button>
					<Button variant="ghost" onClick={refresh}>
						{m.aiEdit.refresh}
					</Button>
				</div>
				<p className="text-muted-foreground text-xs">{m.aiEdit.loginHint}</p>
			</div>
		</div>
	);
}
