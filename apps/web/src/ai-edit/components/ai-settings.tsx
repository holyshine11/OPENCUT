"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader, SectionTitle } from "@/components/section";
import { Input } from "@/components/ui/input";
import { useMessages } from "@/i18n";
import { AiModelSelect } from "./ai-model-select";

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
	const [account, setAccount] = useState<Account>({ status: "loading" });
	/** 브라우저 로그인 끝에 나온 코드. null이면 연결을 누르기 전이다 */
	const [code, setCode] = useState<string | null>(null);

	useEffect(() => {
		void fetchAccount().then(setAccount);
	}, []);

	const refresh = () => {
		setAccount({ status: "loading" });
		void fetchAccount().then(setAccount);
	};

	const errorOf = async (response: Response) =>
		(await response.json().catch(() => null))?.error ?? m.aiEdit.failed;

	const login = async () => {
		// 눌렀을 때 바로 열어야 팝업 차단에 안 걸린다. 주소는 받은 뒤에 넣는다
		const tab = window.open("", "_blank");
		const response = await fetch("/api/ai-edit?action=login", { method: "POST" });
		if (!response.ok) {
			tab?.close();
			toast.error(await errorOf(response));
			return;
		}
		const { url } = await response.json();
		if (tab) tab.location.href = url;
		else window.open(url, "_blank");
		setCode("");
		toast(m.aiEdit.loginOpened);
	};

	const submitCode = async () => {
		const response = await fetch("/api/ai-edit?action=code", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code }),
		});
		if (!response.ok) {
			toast.error(await errorOf(response));
			return;
		}
		setCode(null);
		toast.success(m.aiEdit.loginDone);
		refresh();
	};

	return (
		<div className="flex flex-col">
			<Section showTopBorder={false}>
				<SectionHeader className="justify-between">
					<SectionTitle className="flex-1">{m.aiEdit.model}</SectionTitle>
					<AiModelSelect className="h-auto w-auto border-none bg-transparent p-1" />
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
				{code !== null && (
					<form
						className="flex gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							void submitCode();
						}}
					>
						<Input
							aria-label={m.aiEdit.loginCode}
							placeholder={m.aiEdit.loginCode}
							value={code}
							onChange={(event) => setCode(event.target.value)}
						/>
						<Button type="submit" disabled={!code.trim()}>
							{m.aiEdit.loginSubmit}
						</Button>
					</form>
				)}
				<p className="text-muted-foreground text-xs">{m.aiEdit.loginHint}</p>
			</div>
		</div>
	);
}
