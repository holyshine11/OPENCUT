// 요리드립(@yoridrip) 채널의 쇼츠 48편과 롱폼 6편 자막(2026-11)을 보고 정리한 편집 스타일.
// 채널 색이 바뀌면 이 파일만 고친다. 프롬프트는 서버 라우트가 그대로 Claude에 넘긴다
import { ADJUST_PRESETS } from "@/effects/definitions/adjust-presets";
import { TRANSITION_TYPES } from "@/transitions";
import type { LongBeat } from "./long-cut";
import { type BeatTiming, type EditPlan, IMPACTS, NARRATION_RATE, REVISE_SCOPES, type ReviseScope } from "./plan";
import { sfxGuide } from "./sfx-palette";

const CHANNEL_STYLE = `
# 채널: 요리드립 (Cooking Drip)
남편이 요리하고, 아내가 옆에서 지켜보며 한마디씩 얹는 집밥 요리 채널이다. 화면은 손과 재료 클로즈업(탑뷰·근접)이고 얼굴은 거의 안 나온다.
내레이션은 아내 1인칭 TTS이고 "~합니다/~네요/~답니다" 체로 짧게 끊는다. 영상만 보고 따라 만들 수 있게 레시피를 전하는 것이 뼈대이고, 남편 놀리기(드립)가 사람들이 이 채널을 보는 재미다. 둘 다 빠지면 안 된다.

## 쇼츠(세로, 15~45초, 길어도 70초)
- 첫 1.5초: 완성 음식이나 가장 센 장면 + 훅 한 줄. 훅 자막은 두 줄로 크게.
- 본문: 한 컷 1.5~3초. 재료 투입 → 손질 → 조리 → 완성 순서. 계량은 숫자로 말한다("고춧가루 한 큰술", "약불 5분").
- 중간에 "오늘의 킥"(의외의 재료·방법) 한 번, 가짜 끝("끝! …은 아니죠") 같은 반전 한 번.
- 끝: 한 입 먹는 장면 + 맛 평가를 하다 말고 끊거나("맛은 어떻냐고요? 오늘도 남편이…"), 질문으로 댓글을 부른다("이 정도면 남편이 잘한 건가요?").
- 자막은 내레이션을 그대로 받아 적지 않는다. 내레이션보다 짧고 더 센 요약이다.
  예) 내레이션 "표정만 백종원입니다" → 자막 "표정은 거의 백종원급" / "킹받는데 저녁은 먹어야 하니 참습니다" → "착한 내가 참는다" / 계량 컷은 "한 봉지의 2/3 정도 뿌려줌"
- 자막은 화면 아래 가운데, 한 번에 한 줄(훅만 두 줄), 14자 안쪽.

## 롱폼(가로, 2.5~8분)
- 도입 10초: 왜 이 요리인지(유명 맛집 재현, 방송 레시피 검증, 제철 재료) + "오늘도 남편한테 시켜봤습니다". 도입 드립은 15초 안에 끝내고 바로 재료로 들어간다.
- 본문: 한 컷 3~6초, 과정 설명은 친절하게, 실수와 수습도 그대로 보여 준다("여기서 저희가 작은 실수를 하나 했지 뭐예요").
- 끝: 시식 평가 + 고정 멘트 계열("오늘도 남편 덕분에 맛있는 한끼 잘 얻어 먹었습니다").

## 레시피 전달
- 조리 과정 컷(재료 준비·손질·투입·간·불 조절·끓이기·마무리)의 내레이션에는 레시피 정보가 하나 이상 들어간다: 재료 이름, 양, 불 세기, 시간, 순서, 그렇게 하는 이유, 실패하지 않는 요령, 다 됐는지 보는 법.
- 드립은 정보 문장에 붙여 쓴다. 예) "간은 쯔유 두 국자. 남편 손이 큰 건 오늘만 봐줍니다" / "무는 통째로 넣어야 국물이 시원해집니다. 썰기 귀찮아서가 아니라네요". 정보 없이 드립만 하는 컷은 연달아 두 컷까지만.
- 양은 레시피 메모가 있으면 그 숫자를 그대로 쓴다. 없으면 화면에 보이는 대로 세고 잰다(개수·봉지, 국자·숟가락·컵·잔으로 몇 번, 두른 바퀴 수): "어묵 열 장", "국자로 하나쯤", "혼쯔유 2~3바퀴". 화면으로 알 수 없는 숫자(몇 분, 몇 그램)는 지어내지 않고 상태로 말한다("무가 투명해질 때까지", "한소끔 끓어오르면").
- 셀 수 없는 양은 채널이 쓰는 말로 한다: 적당히, 약간, 조금, 톡톡, 두어 바퀴, 넉넉히, 듬뿍, 취향껏, 기호에 맞게("맛소금 적당히", "후추 톡톡", "꿀은 취향껏", "들기름은 아끼지 말랍니다").
- 계량은 채널 표기 그대로 "간장 1T", "고춧가루 1/2T", "물 500ml", "버터 75g". 양념을 한꺼번에 넣는 컷은 몰아서 부른다("간장 5T, 굴소스 1T, 해선장 3T 넣고요").
- 꼼꼼히 챙길 것: 손질 크기("손가락 한 마디 크기로"), 넣는 순서와 그 이유("파, 마늘은 마지막에", "고춧가루는 한 번 더, 양을 보고 마지막에 맞춥니다"), 불 세기, 다 된 신호("젓가락이 쑥 들어가면"), 대체 재료("설탕 쓸 거면 1T", "없으면 없는 대로"), 맛 평가는 순서대로 구체적으로("처음엔 달콤한데 뒤에 고춧가루 향이 올라옵니다").
- 이유와 요령은 화면에 없어도 요리 상식으로 덧붙인다("꼬막은 오래 삶으면 질겨집니다", "다시마는 오래 끓이면 쓴맛이 납니다").
- 술(소주·맥주·막걸리·와인)은 냄비·팬·볼에 붓는 장면이 보일 때만 재료로 말한다. 잔에 따르거나 병·잔만 보이면 곁들이는 반주다("고추전에 막걸리 한 잔", "이 양반은 고기에 소주까지 챙기네요"). 헷갈리면 반주로 말하고 review에 적는다.
- 롱폼은 재료를 처음 꺼내는 자리에서 재료를 한 번 다 불러 주고, 시식 직전에 핵심 순서를 한두 문장으로 정리한다. 쇼츠는 핵심 재료, 킥, 불·시간 요점 이 세 가지는 꼭 말한다.
- 계량·불·시간을 말하는 컷의 자막은 드립이 아니라 그 정보다("쯔유 2국자", "중불 10분").

## 드립 결: 남편 놀리기가 이 채널의 재미다
- 남편은 "남편", "이 양반", 직접 부를 땐 "자기야". 아내는 지켜보며 의심하고 놀리다가 마지막에 맛은 인정한다("괜히 의심했습니다", "오늘은 남편이 잘했습니다").
- 놀릴 거리는 화면 속 남편 행동에서 찾는다. 채널에서 실제로 쓴 문장:
  - 먹보·뱃살: "옆에서 하나 꺼내 먹으려니 저리 가라고 합니다", "남편은 벌써 몇 개 먹을지 계산 중이네요", "남편 뱃살 나오는 건 모른 척하겠습니다", "식비 초과의 범인은 두 배 먹는 남편입니다"
  - 살림·힘 디스: "택배는 저한테 들게 하고 힘은 이럴 때 씁니다", "이런 건 또 어찌나 야무지게 하는지. 집안일도 좀 야무지게 해 줬으면 합니다만", "아, 이럴 때만 힘씁니다"
  - 수상한 정성: "월급날도 아닌데 전복을 사 왔습니다. 뭘 숨기고 있는 겁니다", "본인 몸보다 전복을 더 열심히 씻습니다", "이 양반 오늘 밤 큰일 납니다"
  - 허세: "표정만 백종원입니다", "눈대중이 아니라 거의 운에 맡깁니다", "오늘 좀 셰프님 모드네요"
  - 의심 쌓기: 이상한 재료가 나올수록 불안이 커진다("여기까지도 정상입니다" → "슬슬 불안합니다" → "갑자기 치즈를 투하합니다")
  - 참는 아내: "킹받는데 저녁은 먹어야 하니 참습니다", "그동안 저는 소파에서 감독하겠습니다", "이렇게 저녁을 잘해 주니 설거지는 제가…"
  - 남편 말 옮기기: 요령을 남편 입으로 전하며 살짝 비꼰다("남편 말로는 이게 핵심이라네요", "부침가루에도 간을 한답니다. 저도 몰랐네요")
  - 끝에 남편에게 묻고 끊기: "잠깐, 자기야 갈아만든배를 넣은 이유가…?", "근데 아까 그거… 뭐였지?"
- 재료 의인화("청국장도 치즈와의 합방에 당황한 것 같습니다"), 말장난('소'라에 '소'주, "여자만, 남자는 안 되냐고요?").
- 놀림은 쇼츠 2~3컷에 한 번, 롱폼은 과정 설명 사이사이 꾸준히 넣는다. 레시피 문장 뒤에 짧게 붙이는 게 기본이고, 점잖은 요리 설명만 이어지면 실패다.
- 욕설·심한 비하·음식 낭비 조롱은 하지 않는다. 화면에 없는 재료나 과정을 지어내지 않는다.

## 제목
- 쇼츠: "감히 OO에 OO를 넣었습니다?", "OO, OO 대신 OO?", "OO 레시피 따라 해봤습니다", "남편이 OO를 …" 계열. 40자 안쪽, 핵심 음식명이 앞쪽.
- 롱폼: 맛집·방송명 + 재현/검증 + 핵심 비법 숫자.
`;

// 사용자가 적은 실제 레시피. 비었으면 절을 만들지 않는다
const recipeBlock = (recipe: string) =>
	recipe.trim()
		? `\n# 레시피 메모\n사용자가 적어 준 실제 레시피다. 재료·양·불·시간은 여기 적힌 대로 말하고, 화면과 다른 점이 보이면 review에 적는다.\n${recipe.trim()}\n`
		: "";

const guideBlock = (guide: string) =>
	guide.trim()
		? `\n# 사용자 요청\n사용자가 이번 다듬기에 직접 적은 요청이다. 무엇보다 먼저 반영한다. 손볼 수 있는 범위 밖이라 반영하지 못한 요청은 review에 그렇게 적는다.\n${guide.trim()}\n`
		: "";

const briefBlock = (brief: string) =>
	`\n# 확정된 기획\n사용자가 네 기획안을 보고 고쳐서 확정했다. 제목·레시피·진행 방식·강조 포인트·놀릴 거리·인터뷰 답은 이대로 따른다. 화면과 다른 점이 보이면 기획을 따르고 review에 적는다. 단, 내레이션 길이 규칙은 기획보다 먼저다. 기획의 문장이 컷 길이에 비해 길면 뜻을 살려 줄인다.\n${brief}\n`;

/**
 * 본 편집 전에 사용자에게 보여 줄 기획안(제목·레시피·진행·포인트·놀릴 거리)과 인터뷰 질문을 받는 프롬프트.
 * 사용자가 고쳐 확정하면 같은 대화를 이어 buildPrompt로 본 편집을 시킨다
 */
export function buildBriefPrompt({
	clips,
	canvas,
	recipe,
}: {
	clips: PromptClip[];
	canvas: { width: number; height: number };
	recipe: string;
}): string {
	const isShort = canvas.height > canvas.width;
	return `너는 이 유튜브 채널의 전담 편집자다. 바로 편집하지 않고, 먼저 기획안을 짜서 사용자(채널 주인, 아내)에게 확인받는다.
${CHANNEL_STYLE}
# 이번 영상
- ${isShort ? "쇼츠(세로, 20~45초)" : "롱폼(가로, 2.5~5분)"}
${recipeBlock(recipe)}
# 촬영 원본
클립마다 스틸 시트(프레임을 격자로 붙인 그림. 왼쪽 위부터 오른쪽으로 아래 시각 순서이고, 프레임마다 밑에 시각이 적혀 있다) 파일이 현재 폴더에 있다. Read로 전부 열어 본다.
${clips.map(clipLine).join("\n")}

# 할 일
시트를 모두 보고 무슨 요리인지, 클립마다 무슨 과정인지 파악해 기획안을 쓴다. 스킬과 검색은 쓰지 않는다.
- title: 채널 제목 틀에 맞는 영상 제목 후보 2~3개(줄마다 하나).
- recipe: 재료와 양(줄마다 "재료 양"), 그다음 만드는 순서(번호, 불 세기·시간·요령 포함). 화면으로 모르는 양은 "적당히/약간/화면 추정" 등으로 쓴다.
- flow: 영상 진행 순서(훅 → 과정 → 킥 → 시식 → 엔딩). 어느 클립의 어떤 장면을 쓰는지 짧게.
- points: 이 영상에서 강조할 포인트(오늘의 킥, 의외의 재료, 비법 숫자) 2~4개.
- funny: 화면 속 남편 행동에서 찾은 놀릴 거리·웃음 포인트 후보 4~6개. 실제로 쓸 내레이션 한 줄 예시를 붙인다.
- questions: 화면만으로는 확실하지 않거나 사용자만 아는 것을 묻는 인터뷰 질문 3~6개. 예) 술·소스를 음식에 넣었는지 곁들였는지, 정확한 양·시간, 이 요리를 하게 된 사연, 남편이 그날 한 웃긴 말이나 행동, 꼭 넣고 싶은 포인트. answer에는 네 추측을 적는다(모르면 빈 문자열). 사용자가 고친다.

# 출력
마지막 메시지는 아래 JSON 하나만 낸다(설명·코드 펜스 없이).
{ "title": "…", "recipe": "…", "flow": "…", "points": "…", "funny": "…", "questions": [{ "question": "…", "answer": "…" }] }
`;
}

// 매번 같은 틀이 나오지 않게 실행할 때마다 하나씩 뽑아 준다
const HOOKS = [
	"도발형: \"감히 OO에 OO를 넣었습니다?\"",
	"결과 먼저형: 완성 장면에 \"이게 집에서 된다고요?\" 같은 한 줄",
	"고발형: \"남편이 또 사고를 칩니다\"로 시작해 이상한 재료를 보여 준다",
	"검증형: \"OO 레시피, 진짜 O분이면 될까요?\"",
	"숫자형: 핵심 비법 숫자를 맨 앞에(\"딱 7분만 갈면 됩니다\")",
	"질문형: 시청자에게 바로 묻는다(\"OO에 이거 넣어 보신 분?\")",
];
const HUMOR = [
	"살림·힘 디스(집안일은 안 하면서 요리할 때만 힘쓴다)",
	"먹보·뱃살(옆에서 집어 먹고, 몇 개 먹을지 계산한다)",
	"수상한 정성(이렇게 열심인 건 뭘 숨기는 거다)",
	"의심 쌓기(재료가 이상할수록 불안이 커지다가 맛에 항복)",
	"참는 아내(킹받지만 저녁은 먹어야 하니 참는다)",
	"남편 말 옮기기(요령을 \"~랍니다/~라네요\"로 전하며 비꼰다)",
	"재료 의인화(재료가 당황하거나 억울해한다)",
	"속마음 자막(내레이션은 점잖게, 자막은 속마음)",
];
const ENDINGS = [
	"맛 평가를 하다 말고 끊는 클리프행어(\"오늘도 남편이…\")",
	"댓글을 부르는 질문(\"이 정도면 잘한 건가요?\")",
	"반전 인정(\"괜히 의심했습니다\")",
	"다음 편 예고나 후일담 한 줄(\"며칠이 지났는데도 계속 생각나네요\")",
	"남편에게 묻고 끊기(\"잠깐, 자기야 그런데 아까 그거…?\")",
];

const pick = (items: string[]) => items[Math.floor(Math.random() * items.length)];

const squash = (text: string) => text.replace(/[\s,.?!…]/g, "");

/** 예시 문장 틀("OO"는 아무 말)이 최근 훅에 이미 쓰인 변주는 뺀다. 다 쓰였으면 전부 돌려준다 */
export function freshHooks(recent: string[]): string[] {
	const used = (hook: string) => {
		const sample = /"([^"]+)"/.exec(hook)?.[1];
		if (!sample) return false;
		const pattern = new RegExp(
			sample
				.split(/O+/)
				.map((part) => squash(part).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
				.join(".*"),
		);
		return recent.some((line) => pattern.test(squash(line)));
	};
	const fresh = HOOKS.filter((hook) => !used(hook));
	return fresh.length > 0 ? fresh : HOOKS;
}

// 1배속 TTS 기준 1초 4.5자를 배속만큼 늘린다
const NARRATION_CHARS_PER_SECOND = Math.floor(4.5 * NARRATION_RATE);

const narrationRule = ({ hasVoice, isShort }: { hasVoice: boolean; isShort: boolean }) =>
	hasVoice
		? `내레이션은 TTS로 읽어 ${NARRATION_RATE}배속으로 튼다. 그 속도로 1초에 7~8자를 읽지만 숨 쉴 틈을 남기도록 한 컷의 내레이션은 (컷 길이 × ${NARRATION_CHARS_PER_SECOND})자를 넘기지 않는다. 끓는 소리·붓는 소리·써는 소리처럼 원음이 좋은 컷은 narration을 빈 문자열로 두고 원음을 들려준다(${isShort ? "1~2컷" : "3~5컷"}). 원음 컷은 전할 레시피 정보가 없는 컷에서 고른다. 재료를 넣거나 간을 하는 컷은 비우지 않는다.`
		: "내레이션 음성이 없다. narration은 빈 문자열로 두고 자막(caption)만으로 이야기를 끌고 간다.";

export interface PromptClip {
	/** 프롬프트와 계획에서 쓰는 번호. c01부터 */
	id: string;
	name: string;
	duration: number;
	/** 스틸 시트에 왼쪽 위부터 오른쪽으로 놓인 프레임의 시각(초) */
	times: number[];
	sheetFile: string;
}

export function buildPrompt({
	clips,
	canvas,
	hasVoice,
	hasHusbandVoice,
	sounds,
	bgms,
	recent,
	recipe,
	brief,
}: {
	clips: PromptClip[];
	canvas: { width: number; height: number };
	/** 내레이션 음성을 만들 수 있는지. 없으면 자막만으로 이야기를 끌고 간다 */
	hasVoice: boolean;
	/** 남편 대사를 아내와 다른 목소리로 읽을 수 있는지 */
	hasHusbandVoice: boolean;
	/** 쓸 수 있는 효과음 파일 이름. 이름이 곧 어떤 소리인지의 설명이다 */
	sounds: string[];
	/** 깔 수 있는 배경음악 파일 이름. 이름 앞이 장르다 */
	bgms: string[];
	/** 최근에 쓴 훅. 겹치지 않게 한다 */
	recent: string[];
	/** 사용자가 적은 이 프로젝트의 레시피 메모. 비어 있을 수 있다 */
	recipe: string;
	/** 사용자가 확인하고 고친 기획안(briefText). 있으면 레시피 메모 대신 이것을 따른다 */
	brief?: string;
}): string {
	const isShort = canvas.height > canvas.width;
	return `너는 이 유튜브 채널의 전담 편집자다. 아래 채널 스타일대로 촬영 원본을 편집 계획(JSON)으로 만든다.
${CHANNEL_STYLE}
# 이번 영상
- 화면: ${canvas.width}x${canvas.height} → ${isShort ? "쇼츠. 완성 길이 20~45초" : "롱폼. 완성 길이 2.5~5분(원본이 짧으면 그만큼만)"}
- ${narrationRule({ hasVoice, isShort })}
- 이번 변주(매번 다르게 만들기 위한 지정값이다. 꼭 따른다):
  - 훅: ${brief ? "확정된 기획의 진행 방식대로" : pick(freshHooks(recent))}
  - 드립: ${brief ? (isShort ? "확정된 기획의 놀릴 거리·웃음 포인트 중 가장 센 2~3개만 쓰고" : "확정된 기획의 놀릴 거리·웃음 포인트를 전부 쓰고") : pick(HUMOR)} + 네가 영상을 보고 고른 것 하나
  - 엔딩: ${brief ? "확정된 기획의 진행 방식대로" : pick(ENDINGS)}
${recent.length > 0 ? `- 최근 영상에서 이미 쓴 훅이다. 같은 문장 틀을 피한다:\n${recent.map((hook) => `  - ${hook}`).join("\n")}` : ""}
${brief ? briefBlock(brief) : recipeBlock(recipe)}
# 촬영 원본
클립마다 스틸 시트(프레임을 격자로 붙인 그림. 왼쪽 위부터 오른쪽으로 아래 시각 순서이고, 프레임마다 밑에 시각이 적혀 있다) 파일이 현재 폴더에 있다. Read로 전부 열어 본다. 이 대화에서 이미 연 시트는 다시 열지 않는다.
${clips.map(clipLine).join("\n")}

# 작업 순서
1. 컷 편집: 시트를 보고 무슨 요리인지, 클립마다 무슨 과정인지 파악한다. 쓸 구간만 고르고 순서를 정한다. 흔들리거나 아무 일도 없는 구간, 같은 동작 반복은 버린다. 가장 맛있어 보이는 완성 장면을 맨 앞 훅으로 한 번 당겨 써도 된다. 컷 길이는 1~2초짜리 짧은 컷(재료 클로즈업, 리액션)과 5~8초짜리 과정 컷을 섞어 리듬을 만든다. 비슷한 길이의 컷이 세 개 넘게 이어지지 않게 한다.
2. 컨셉·대본: 먼저 이 요리의 레시피를 정리한다(재료와 양, 순서, 불과 시간, 킥). 확정된 기획이나 레시피 메모가 있으면 그것이 기준이다. ${isShort ? "쇼츠는 20~45초라 레시피를 다 싣지 못한다. 핵심 재료·킥·비법 숫자만 골라 과정 컷에 싣고, 전체 재료·양·순서는 youtube.description에 쓴다. 그 위에" : "정리한 레시피를 과정 컷에 빠짐없이 나눠 싣고, 그 위에"} 드립을 얹어 컷마다 내레이션을 쓴다. 이 영상만의 한 줄 컨셉도 정한다. 화면에 없는 재료나 과정은 말하지 않는다.
3. 자막: 컷마다 자막을 쓴다. 내레이션의 받아쓰기가 아니라 더 짧고 센 요약이다. 14자 안쪽, 훅만 줄바꿈(\\n) 한 번 허용. 계량·불·시간을 말하는 컷은 그 정보를 자막으로 쓴다.
4. 효과·색감: 음식 색에 맞는 색 보정 하나와, 장면이 크게 바뀌는 자리(시간 경과, 완성)에만 전환을 넣는다. 전환은 전체에서 0~3번.
   - ${sfxRule(isShort)}
   - ${BGM_RULE}
   - 화면 효과(impact): 가장 센 컷 1~3개에만. "zoom"은 화면을 당겨 잡는 강조(킥·완성 클로즈업), 나머지는 순간 효과라 2초 안쪽 컷에만 쓴다. 음식이 맛없어 보이게 만드는 효과는 쓰지 않는다.
   - 모자이크(mosaic): 사람 얼굴, 속옷이나 노출, 화면에 비친 개인정보(주소·전화번호·차 번호판·택배 송장)가 보이는 컷은 빠짐없이 가린다. 그 컷 구간의 모든 스틸을 확인해서, 대상이 컷 안에서 움직인 범위를 전부 덮는 영역을 프레임 비율(왼쪽 위가 0,0 오른쪽 아래가 1,1)로 적는다. 애매하면 가리는 쪽을 고른다. 가릴 게 없으면 빈 배열. 가린 컷은 review에 "c03 2.0~4.5초 얼굴 모자이크"처럼 적어 사용자가 확인하게 한다.
5. 검토: 스킬은 쓰지 않는다. WebSearch는 딱 한 번만 써서 이 요리의 요즘 검색어·화제(방송, 맛집, 제철)를 확인해 제목과 태그에 반영한다. 그다음 계획을 처음부터 다시 읽고 ①첫 컷이 1.5초 안에 궁금증을 만드는지 ②내레이션 길이가 컷 길이에 맞고 원음만 들려주는 컷이 있는지, 컷 길이가 단조롭지 않은지 ③같은 구간을 두 번 쓰지 않았는지(훅 제외) ④${isShort ? "핵심 레시피 정보(킥·비법 숫자)가 실렸는지" : "과정 컷마다 레시피 정보(재료·양·불·시간·이유)가 실렸는지"}, 드립만 하는 컷이 세 컷 연달아 나오지 않는지, 남편 놀리기가 2~3컷에 한 번꼴로 들어갔는지, 술을 재료로 말했다면 화면에 붓는 장면이 있는지 ⑤모든 start/end가 클립 길이 안인지 ⑥얼굴·속옷·개인정보가 보이는데 mosaic이 빠진 컷이 없는지 확인하고 고친다. 화면만 보고 어림한 양은 review에 "7번 컷: 쯔유 양은 화면 추정"처럼 적어 사용자가 확인하게 한다.

${STEP_LINES}

${planOutput({ isShort, hasHusbandVoice, sounds, bgms })}`;
}

const STEP_LINES = '단계를 넘어갈 때마다 "[1/5] 컷 편집: (한 줄 요약)" 형식으로 한 줄씩 말한다. 사용자가 이 줄을 진행 화면에서 본다.';

/** 처음 편집과 쇼츠 줄이기가 같이 받는 계획 JSON 모양과 효과음·BGM 목록 */
const planOutput = ({
	isShort,
	hasHusbandVoice,
	sounds,
	bgms,
}: {
	isShort: boolean;
	hasHusbandVoice: boolean;
	sounds: string[];
	bgms: string[];
}) => `# 출력
마지막 메시지는 아래 JSON 하나만 낸다(설명·코드 펜스 없이).
{
  "concept": "한 줄 컨셉",
  "hook": "첫 컷 내레이션 또는 자막 그대로",
  "look": ${LOOKS},
  "bgm": null | "BGM 파일 이름",
  "beats": [
    ${BEAT_SHAPE}
  ],
  "youtube": { "title": "…", "description": "첫 두 줄에 핵심 검색어, 재료·계량 목록, 만드는 순서(번호 목록), 해시태그 3개", "tags": ["…"] },
  "review": ["검토하면서 고친 점이나 사용자가 확인할 점"]
}
- beats는 완성 영상의 컷 순서다. start/end는 그 클립 안의 초이고 end - start는 ${isShort ? "1.2~4" : "1~8"}초.
- transition은 그 컷에서 다음 컷으로 넘어갈 때의 전환이다.
${voiceRule(hasHusbandVoice)}

${sfxGuide(sounds)}

${bgmList(bgms)}
`;

const longLine = ({ beat, number }: { beat: LongBeat; number: number }) =>
	`${number}. ${beat.clip} ${seconds(beat.start)}~${seconds(beat.end)}초 | 내레이션${beat.voice === "husband" ? "(남편)" : ""}: ${beat.narration ? JSON.stringify(beat.narration) : "(원음)"} | 자막: ${beat.caption ? JSON.stringify(beat.caption) : "(없음)"}`;

/**
 * 이미 만든 롱폼 타임라인을 줄여 같은 영상의 쇼츠 계획을 받는 프롬프트.
 * 기획안·촬영본 스틸 없이 롱폼 컷 목록(글)만 보내서, 처음부터 만들 때보다 훨씬 빨리 끝난다
 */
export function buildShortsPrompt({
	long,
	canvas,
	hasVoice,
	hasHusbandVoice,
	sounds,
	bgms,
	recipe,
}: {
	long: LongBeat[];
	canvas: { width: number; height: number };
	hasVoice: boolean;
	hasHusbandVoice: boolean;
	sounds: string[];
	bgms: string[];
	recipe: string;
}): string {
	return `너는 이 유튜브 채널의 전담 편집자다. 이미 완성한 롱폼 편집본을 줄여 같은 영상의 쇼츠 버전을 편집 계획(JSON)으로 만든다.
${CHANNEL_STYLE}
# 이번 영상
- 화면: ${canvas.width}x${canvas.height} → 쇼츠. 완성 길이 20~45초
- ${narrationRule({ hasVoice, isShort: true })}
${recipeBlock(recipe)}
# 롱폼 편집본
사용자가 확인하고 손본 롱폼의 컷 순서다(클립 번호, 클립 안의 구간, 그 컷의 내레이션과 자막). 촬영본 스틸은 보내지 않았다. 화면에 무엇이 나오는지는 내레이션·자막으로 짐작하고, 컷은 여기 적힌 구간 안에서만 고른다. 적히지 않은 구간은 무엇이 찍혔는지 모르고, 그런 컷은 앱이 버린다.
${long.map((beat, index) => longLine({ beat, number: index + 1 })).join("\n")}

# 작업 순서
1. 컷 편집: 롱폼 컷에서 쇼츠에 쓸 것만 골라 구간을 줄인다. 순서는 롱폼을 따르되, 가장 센 장면(완성·킥·시식) 하나를 맨 앞 훅으로 당겨 써도 된다.
2. 대본: 쇼츠는 20~45초라 레시피를 다 싣지 못한다. 핵심 재료·킥·비법 숫자만 싣고, 전체 재료·양·순서는 youtube.description에 쓴다. 드립은 롱폼에서 가장 센 것 2~3개만 살린다. 롱폼 문장이 내레이션 길이 규칙 안에 들면 글자 하나 바꾸지 말고 그대로 쓴다(음성을 다시 만들지 않아 빨리 끝난다). 길면 뜻을 살려 줄인다. 엔딩은 채널 쇼츠 엔딩 틀로 끊는다.
3. 자막: 14자 안쪽, 훅만 줄바꿈(\\n) 한 번 허용. 롱폼 자막이 맞으면 그대로 쓴다. 계량·불·시간을 말하는 컷은 그 정보를 자막으로 쓴다.
4. 효과·색감: 음식 색에 맞는 색 보정 하나, 전환은 0~2번.
   - ${sfxRule(true)}
   - ${BGM_RULE}
   - 화면 효과(impact): 가장 센 컷 1~3개에만.
   - 모자이크(mosaic): 빈 배열로 둔다. 롱폼에서 가린 영역은 앱이 같은 구간에 그대로 옮긴다.
5. 검토: 스킬과 검색은 쓰지 않는다. 계획을 다시 읽고 ①첫 컷이 1.5초 안에 궁금증을 만드는지 ②내레이션 길이가 컷 길이에 맞는지 ③같은 구간을 두 번 쓰지 않았는지(훅 제외) ④핵심 레시피 정보(킥·비법 숫자)가 실렸는지 ⑤모든 start/end가 롱폼 구간 안인지 확인하고 고친다.

${STEP_LINES}

${planOutput({ isShort: true, hasHusbandVoice, sounds, bgms })}`;
}

const LOOKS = ADJUST_PRESETS.map((preset) => `"${preset.id}"`).join(" | ");
const BEAT_SHAPE = `{ "clip": "c01", "start": 0.0, "end": 2.5, "narration": "…", "voice": "wife" | "husband", "caption": "…", "transition": null | ${TRANSITION_TYPES.map((type) => `"${type}"`).join(" | ")}, "sfx": null | "효과음 파일 이름", "sfxOn": "효과음이 떨어질 내레이션 속 낱말", "impact": null | ${IMPACTS.map((impact) => `"${impact}"`).join(" | ")}, "mosaic": [{ "x": 0.4, "y": 0.1, "w": 0.2, "h": 0.25 }] }`;
const voiceRule = (hasHusbandVoice: boolean) =>
	`- voice: ${hasHusbandVoice ? '기본은 "wife"(아내 내레이션). 남편이 직접 하는 말(변명, 자랑, 아내 드립에 대한 대꾸)만 "husband"로 하고 남편 말투("~거든?", "~라니까")로 쓴다. 남편 대사는 전체의 2할을 넘기지 않는다.' : '전부 "wife"로 둔다.'}`;
const bgmList = (bgms: string[]) =>
	`# BGM 목록\n${bgms.length > 0 ? bgms.map((name) => name.normalize("NFC")).join("\n") : "(없음. bgm은 null)"}`;
const seconds = (value: number) => value.toFixed(1);
const clipLine = (clip: PromptClip) =>
	`- ${clip.id} "${clip.name}" ${seconds(clip.duration)}초 → ${clip.sheetFile} (프레임 시각: ${clip.times.map(seconds).join(", ")}초)`;

// 횟수와 종류는 채널 영상 54편에서 잰 값이다(sfx-palette.ts): 쇼츠 30초에 3.5번·4가지, 롱폼 30초에 2.4번·18가지. 컷 전환과는 거의 겹치지 않고 말에 붙어 있었다
const sfxRule = (isShort: boolean) =>
	`효과음(sfx): 화면 전환이 아니라 말에 붙인다. 새 문장이 시작되는 자리, 재료·계량을 부르는 낱말, 반전·킥·실패·시식 같은 포인트에 넣는다. ${isShort ? "30초에 3~5번, 한 편에 3~5가지 소리만 돌려 쓴다" : "30초에 2~3번, 소리 종류는 1분에 4~5가지꼴로 돌려 쓴다(5분이면 10~18가지)"}. 재료·계량을 줄줄이 부르는 컷은 컷마다 같은 소리를 반복해도 되고, 그 밖에는 연달아 두 컷에 넣지 않는다. 효과음 목록의 '주로 쓰는 소리'에서 쓰임새가 맞는 것을 고르고 파일 이름을 글자 그대로 쓴다. 맞는 게 없으면 null. sfxOn에는 소리가 떨어질 내레이션 속 낱말을 그대로 적는다(비우면 내레이션 시작에 떨어진다).`;
const BGM_RULE =
	"배경음악(bgm): 영상 전체에 깔 연주곡 하나를 BGM 목록에서 고른다. 이름 앞이 장르다. 내레이션 밑에 작게 깔리니 말을 방해하지 않는 곡으로 고른다: 차분한 조리 과정은 잔잔한·재즈·힙합, 빠르고 신나는 영상은 댄스·테크노, 정갈한 한식·디저트는 클래식. 맞는 게 없으면 null.";

// 다듬을 때 범위마다 시키는 일. "전체"는 이걸 차례로 다 한다
const CHECKS = {
	cuts: "컷은 다시 고르지 않는다. 새 클립에 빠진 과정(재료 투입, 킥, 완성, 시식)이 있으면 맞는 자리에 컷을 넣는다. 완성 길이보다 짧으면 안 쓴 구간에서 채우고, 길면 늘어지는 컷을 줄이거나 뺀다. 같은 구간을 두 번 쓴 컷(훅 제외)은 하나만 남긴다. 비슷한 길이의 컷이 길게 이어지면 짧은 컷을 섞는다.",
	narration: "⚠ 표시가 있는 컷은 내레이션을 줄이거나 컷을 늘린다(end). 원음만 들려주는 컷이 없으면 전할 레시피 정보가 없고 소리가 좋은 컷의 내레이션을 비운다.",
	script: "첫 컷이 1.5초 안에 궁금증을 만드는지, 과정 컷마다 레시피 정보(재료·양·불·시간·이유·요령)가 실렸는지, 남편 놀리기가 2~3컷에 한 번꼴인지, 엔딩이 끊기지 않는지 보고 약한 문장만 다시 쓴다. 정보 없이 드립만 하는 과정 컷은 정보를 넣어 다시 쓴다.",
	captions: "내레이션을 그대로 받아 적었거나 14자를 넘는 자막, 내레이션은 있는데 자막이 빈 컷을 고친다. 계량·불·시간을 말하는 컷인데 자막이 드립이면 그 정보로 바꾼다.",
	sfx: (isShort: boolean) => `${sfxRule(isShort)} 모자라면 넣고, 넘치거나 쓰임새가 안 맞는 소리는 빼거나 바꾼다.`,
	// 사용자가 BGM만 골라 돌렸다는 건 지금 곡을 바꾸고 싶다는 뜻이다
	bgm: "BGM이 없으면 영상 분위기에 맞는 곡을 고르고, 있으면 지금 곡이 아닌 다른 곡으로 바꾼다. 분위기에 맞되 지금 곡과 장르나 빠르기가 다른 곡을 고른다.",
};

// 범위 하나만 다듬을 때: 프롬프트에서 부르는 이름과 set 예시
const SCOPED: Record<Exclude<ReviseScope, "all">, { name: string; example: string }> = {
	script: { name: "내레이션 문장(대본)", example: '"narration": "…"' },
	sfx: { name: "효과음", example: '"sfx": "효과음 파일 이름", "sfxOn": "낱말"' },
	bgm: { name: "배경음악", example: "" },
	cuts: { name: "컷 구성", example: '"end": 4.2' },
	captions: { name: "자막", example: '"caption": "…"' },
	narration: { name: "내레이션 길이와 원음 컷", example: '"narration": "…", "end": 4.2' },
};

/**
 * 이미 AI 편집을 해 둔 타임라인을 다시 다듬게 하는 프롬프트. 처음부터 다시 만들면 촬영본을 전부 다시 보느라
 * 사용량만 드니, 지난 계획을 글로 보여 주고 고칠 컷만 changes로 받는다(받은 건 revisePlan이 얹는다).
 * scope가 all이 아니면 그 범위의 일만 시킨다. 촬영본은 all·cuts에만, 효과음 목록은 all·sfx에만, BGM 목록은 all·bgm에만 넣는다
 */
export function buildRevisePrompt({
	clips,
	canvas,
	hasVoice,
	hasHusbandVoice,
	sounds,
	bgms,
	plan,
	timing,
	seen,
	scope,
	recipe,
	guide = "",
}: {
	clips: PromptClip[];
	canvas: { width: number; height: number };
	hasVoice: boolean;
	hasHusbandVoice: boolean;
	sounds: string[];
	bgms: string[];
	/** 지금 타임라인에 들어가 있는 계획 */
	plan: EditPlan;
	/** plan.beats와 같은 순서. 실제로 놓인 길이를 모르는 컷은 비어 있다 */
	timing: (BeatTiming | undefined)[];
	/** 지난 편집 때 이미 본 클립 번호. 여기 없는 클립만 새로 들어온 것이다 */
	seen: string[];
	scope: ReviseScope;
	recipe: string;
	/** 다듬기 범위를 고를 때 사용자가 적은 요청 */
	guide?: string;
}): string {
	const isShort = canvas.height > canvas.width;
	const all = scope === "all";
	const reshapes = all || scope === "cuts";
	// 내레이션을 쓰지 않는 범위에는 말투 규칙을 보내지 않는다
	const silent = scope === "captions" || scope === "sfx" || scope === "bgm";
	const total = plan.beats.reduce((sum, beat, index) => sum + (timing[index]?.length ?? beat.end - beat.start), 0);
	const beatLines = plan.beats.map((beat, index) => {
		const placed = timing[index];
		const voice = placed?.voice;
		const late = placed && voice && voice > placed.length ? ` ⚠ 음성 ${seconds(voice)}초가 컷 ${seconds(placed.length)}초보다 길다` : "";
		// 곡을 고르는 데는 영상의 분위기(말)만 있으면 된다
		if (scope === "bgm") return `${index + 1}. ${beat.narration || beat.caption || "(원음)"}`;
		return [
			`${index + 1}. ${beat.clip} ${seconds(beat.start)}~${seconds(beat.end)}초`,
			`내레이션(${beat.voice}): ${beat.narration ? `"${beat.narration}"` : "없음"}${late}`,
			`자막: ${beat.caption ? `"${beat.caption.replace("\n", "\\n")}"` : "없음"}`,
			`전환: ${beat.transition ?? "-"}`,
			`효과음: ${beat.sfx?.normalize("NFC") ?? "-"}${beat.sfx && beat.sfxOn ? `("${beat.sfxOn}"에)` : ""}`,
			`효과: ${beat.impact ?? "-"}`,
			`모자이크: ${beat.mosaic.length}곳`,
		].join(" | ");
	});
	const usage = (clip: PromptClip) => {
		const used = plan.beats.filter((beat) => beat.clip === clip.id);
		return used.length > 0
			? `쓴 구간: ${used.map((beat) => `${seconds(beat.start)}~${seconds(beat.end)}`).join(", ")}`
			: seen.includes(clip.id)
				? "지난번에 보고 안 쓴 클립"
				: "새 클립";
	};

	const footage = `
# 촬영 원본
클립마다 스틸 시트(프레임을 격자로 붙인 그림. 프레임마다 밑에 시각이 적혀 있다) 파일이 현재 폴더에 있다. 시트는 한 장만 열어도 사용량이 크게 든다. 지난번에 이미 다 보고 고른 것이니 기본은 한 장도 열지 않고 위 컷 목록(글)만으로 점검한다.
Read로 여는 건 이 셋뿐이다: ① "새 클립"(지난 편집 뒤에 들어와 아직 본 적이 없다) ② 지금 편집본이 완성 길이보다 짧아 컷을 더 넣어야 할 때, 안 쓴 구간이 가장 길게 남은 클립 한두 개 ③ 화면을 봐야만 고칠 수 있는 컷의 클립.
"지난번에 보고 안 쓴 클립"은 보고 나서 뺀 것이니 다시 열지 않는다.
${clips.map((clip) => `${clipLine(clip)} [${usage(clip)}]`).join("\n")}
`;

	const work = all
		? `# 작업 순서
1. 컷 점검: ${CHECKS.cuts}
2. 대본 점검: ${CHECKS.narration} ${CHECKS.script}
3. 자막 점검: ${CHECKS.captions}
4. 효과 점검: ${CHECKS.sfx(isShort)} BGM이 없거나 분위기와 안 맞으면 고른다. 화면 효과는 가장 센 컷 1~3개, 전환은 0~3번으로 맞춘다. 시트를 연 컷에 얼굴·속옷·개인정보가 보이는데 모자이크가 없으면 넣는다(프레임 비율, 왼쪽 위가 0,0).
5. 마무리: 제목·설명·태그는 비어 있거나 채널 규칙에 어긋날 때만 고친다. WebSearch와 스킬은 쓰지 않는다. 고친 내용을 review에 "3번 컷: 자막을 줄임"처럼 적는다. 고칠 게 없으면 changes를 비우고 review에 그렇게 적는다. 억지로 고치지 않는다.

단계를 넘어갈 때마다 "[1/5] 컷 점검: (한 줄 요약)" 형식으로 한 줄씩 말한다. 사용자가 이 줄을 진행 화면에서 본다.`
		: `# 할 일
${scope === "sfx" ? CHECKS.sfx(isShort) : CHECKS[scope]}${scope === "cuts" ? " 새로 넣는 컷에는 내레이션과 자막도 채운다(sfx와 impact는 null). 원래 있던 컷은 구간과 전환만 고친다." : ""}
WebSearch와 스킬은 쓰지 않는다. ${scope === "bgm" ? "고른 곡과 이유를 review에 한 줄로 적는다." : '고친 내용을 review에 "3번 컷: (무엇을 고쳤는지)"처럼 적는다. 고칠 게 없으면 changes를 비우고 review에 그렇게 적는다. 억지로 고치지 않는다.'}
작업 중간에는 아무 말도 하지 않는다.`;

	const picksBgm = all || scope === "bgm";
	const shape = `{${
		scope === "bgm"
			? ""
			: `
  "changes": [
    { "beat": 3, "set": { ${all ? '"caption": "…", "end": 4.2' : SCOPED[scope].example} } }${
			reshapes ? `,\n    { "beat": 5, "remove": true },\n    { "after": 5, "add": ${BEAT_SHAPE} }` : ""
		}
  ],`
	}${all ? `\n  "look": ${LOOKS},\n  "youtube": { "title": "…", "description": "…", "tags": ["…"] },` : ""}${picksBgm ? '\n  "bgm": "BGM 파일 이름",' : ""}
  "review": ["고친 점과 사용자가 확인할 점"]
}`;
	const rules = [
		...(scope === "bgm"
			? []
			: [
					`- changes의 beat${reshapes ? "와 after" : ""}는 위 컷 목록의 번호다${reshapes ? "(고치는 중에 번호가 밀려도 원래 번호를 쓴다). after: 0은 맨 앞에 넣는다" : ""}.`,
					all
						? "- set에는 그 컷에서 바꿀 항목만 적는다. 항목은 add의 컷과 같다. mosaic을 적으면 그 컷의 영역 전체를 바꾼다."
						: `- set에 적을 수 있는 항목은 ${REVISE_SCOPES[scope].join(", ")}뿐이다. 다른 항목은 적어도 반영되지 않는다. 비우려면 ${scope === "sfx" ? "null" : '""'}을 적는다.`,
				]),
		...(reshapes || scope === "narration"
			? [`- start/end는 그 클립 안의 초이고 end - start는 ${isShort ? "1.2~4" : "2~8"}초.${reshapes ? " transition은 그 컷에서 다음 컷으로 넘어갈 때의 전환이다." : ""}`]
			: []),
		...(all ? ["- look, youtube와 그 안의 항목은 바꿀 때만 적는다."] : []),
		...(silent ? [] : [voiceRule(hasHusbandVoice)]),
		...(picksBgm ? ["- bgm은 바꿀 때만 적는다. 아래 BGM 목록의 파일 이름을 글자 그대로 쓰고, 빼려면 null."] : []),
		...(all || scope === "sfx" ? ["", sfxGuide(sounds)] : []),
		...(picksBgm ? ["", bgmList(bgms)] : []),
	];

	return `너는 이 유튜브 채널의 전담 편집자다. 지난번에 네가 편집해 타임라인에 올려 둔 영상을 다시 열었다.
처음부터 다시 만들지 않는다. ${all ? "사람 편집자가 가편집본을 돌려 보듯, 아래 편집본을 읽고 고칠 곳·빠진 곳·더 좋아질 곳만 찾아 그 컷만 고친다." : `이번에는 ${SCOPED[scope].name}만 손본다.`} 멀쩡한 컷은 건드리지 않는다.
${CHANNEL_STYLE}
# 이번 영상
- 화면: ${canvas.width}x${canvas.height} → ${isShort ? "쇼츠. 완성 길이 20~45초" : "롱폼. 완성 길이 2.5~5분(원본이 짧으면 그만큼만)"}. 지금 편집본은 ${seconds(total)}초다.
${silent ? "" : `- ${narrationRule({ hasVoice, isShort })}\n`}${scope === "sfx" || scope === "bgm" ? "" : recipeBlock(recipe)}
# 지금 편집본
- 컨셉: ${plan.concept}
${picksBgm ? `- BGM: ${plan.bgm?.normalize("NFC") ?? "없음"}\n` : ""}${
	all
		? `- 색 보정: ${plan.look ?? "없음"}
- 제목: ${plan.youtube.title}
- 설명: ${plan.youtube.description.replaceAll("\n", " / ")}
- 태그: ${plan.youtube.tags.join(", ")}
${plan.review.length > 0 ? `- 지난번 검토 메모: ${plan.review.join(" / ")}\n` : ""}`
		: ""
}컷 목록(번호가 완성 영상의 순서다):
${beatLines.join("\n")}
${reshapes ? footage : ""}${guideBlock(guide)}
${work}

# 출력
마지막 메시지는 아래 JSON 하나만 낸다(설명·코드 펜스 없이). 바뀐 것만 적는다.
${shape}
${rules.join("\n")}
`;
}
