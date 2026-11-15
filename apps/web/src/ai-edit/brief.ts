import { parseObject, record, text } from "./plan";

/** 본 편집 전에 사용자에게 먼저 보여 주고 고치게 하는 기획안. 확정하면 본 편집이 이대로 따른다 */
export interface EditBrief {
	title: string;
	recipe: string;
	flow: string;
	points: string;
	funny: string;
	questions: { question: string; answer: string }[];
	/** 기획안을 만든 claude 대화. 본 편집이 이어 받아 촬영본을 다시 보지 않는다 */
	sessionId: string | null;
}

// 모델이 줄 목록을 배열로 줄 때가 있어 한 칸에 줄바꿈으로 편다
const lines = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean).join("\n") : text(value));

export function parseBrief({ output, sessionId }: { output: string; sessionId: string | null }): EditBrief {
	const raw = parseObject(output);
	const brief = {
		title: text(raw.title),
		recipe: lines(raw.recipe),
		flow: lines(raw.flow),
		points: lines(raw.points),
		funny: lines(raw.funny),
		questions: (Array.isArray(raw.questions) ? raw.questions : []).flatMap((item) => {
			const question = text(record(item).question);
			return question ? [{ question, answer: text(record(item).answer) }] : [];
		}),
		sessionId,
	};
	if (!brief.recipe && !brief.flow) throw new Error("no brief");
	return brief;
}

/** 확정한 기획안을 프롬프트와 레시피 메모에 넣을 글로 */
export function briefText(brief: EditBrief): string {
	const qa = brief.questions
		.filter((item) => item.answer.trim())
		.map((item) => `- Q. ${item.question}\n  A. ${item.answer.trim()}`)
		.join("\n");
	return [
		`## 요리 제목\n${brief.title}`,
		`## 레시피\n${brief.recipe}`,
		`## 진행 방식\n${brief.flow}`,
		`## 강조 포인트\n${brief.points}`,
		`## 놀릴 거리·웃음 포인트\n${brief.funny}`,
		qa && `## 인터뷰 답\n${qa}`,
	]
		.filter((part) => part && part.split("\n")[1]?.trim())
		.join("\n\n");
}
