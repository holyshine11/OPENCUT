export type DiagnosticSeverity = "caution" | "error";

export interface DiagnosticDefinition {
	id: string;
	scope: string;
	severity: DiagnosticSeverity;
	/** 보여 줄 때의 언어로 읽도록 함수로 둔다 */
	message: () => string;
}
