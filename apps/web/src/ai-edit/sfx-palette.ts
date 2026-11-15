/**
 * 채널(@yoridrip) 영상 54편(롱폼 6, 쇼츠 48)의 오디오에서 번들 효과음이 실제로 쓰인 358곳을 파형 대조로 찾아 정리한 것.
 * name은 public/sounds의 파일 이름(확장자 제외), use는 그 소리가 놓인 자리의 말에서 읽은 쓰임새다.
 * 앞에 있을수록 자주 썼다(wow 74번, effect1 64번, 띠용 27번 — 이 셋이 쇼츠 효과음의 6할이다)
 */
export const SFX_PALETTE = [
	{ name: "wow", use: "한 단계를 마치고 다음 문장으로 넘어가는 머리, 결과를 보여 주거나 맛보기 직전. 가장 자주 쓴다" },
	{ name: "effect1", use: "재료·계량을 하나씩 부를 때. 줄줄이 이어지면 컷마다 반복한다" },
	{ name: "띠용", use: "반전, 남편의 엉뚱한 행동, '근데'로 뒤집는 문장. 쇼츠는 첫 5초 훅에 한 번" },
	{ name: "effect10", use: "양념을 넣는 동작, 계량 확인" },
	{ name: "error", use: "실패, 문제 발생, 불길한 예고" },
	{ name: "귀여운 힐끔 휘익", use: "화제를 돌리거나 다음 재료·장면으로 휙 넘어갈 때" },
	{ name: "뚜훅", use: "오늘의 킥·비밀을 공개하기 직전에 뜸 들이는 문장" },
	{ name: "haleeloya", use: "킥 재료 공개, 기다리던 결과" },
	{ name: "duck", use: "말실수, 허당 짓" },
	{ name: "wine2", use: "술·물·육수를 붓는 동작" },
	{ name: "방울방울 올라오는", use: "끓이기 시작할 때, 국물 이야기" },
	{ name: "딸랑딸랑딸랑 덜덜덜 떠는 효과음", use: "'그런데 여기서…' 같은 긴장되는 예고" },
	{ name: "05자막용_따닥", use: "재료 목록 자막이 뜰 때" },
	{ name: "두둥", use: "극적인 공개" },
	{ name: "big-punch", use: "센 한 방, 단정하는 드립" },
	{ name: "shotgun", use: "'오늘의 킥' 한마디" },
	{ name: "앙팡치즈 아기 웃음소리", use: "맛있어서 기쁠 때, 설렐 때" },
	{ name: "핑거스냅 손가락 팅기는 효과음", use: "한입 먹고 감탄하기 직전" },
	{ name: "긴장하는 긴장 중인 심장박동", use: "결과를 기다리는 순간" },
] as const;

/** 두세 번씩 쓴 소리. 쓰임새는 이름이 말해 준다 */
const SFX_OCCASIONAL = [
	"effect13", "내용 스포 개그", "보통자막", "떵! 뿅 뼝_ 효과음", "effect14", "effect11", "으갹",
	"야구방망이 깡! 효과음", "폭발", "대나무 타격", "정답음 띠롱 띵동", "투누누", "water-splash", "카톡", "타탓",
	"팝1", "팝", "레벨업 성공", "귀엽게 먹는", "느낌표 물음표 (또독)", "punch",
];

const stem = (fileName: string) => fileName.replace(/\.[^.]+$/, "").normalize("NFC");

/** 채널에서 실제로 쓴 적이 있는 효과음인지 */
export const isChannelSfx = (fileName: string) =>
	SFX_PALETTE.some((item) => item.name === stem(fileName)) || SFX_OCCASIONAL.includes(stem(fileName));

/**
 * 프롬프트에 넣을 효과음 목록. 채널에서 쓰던 소리를 쓰임새와 함께 먼저 보여 주고, 나머지는 이름만 뒤에 둔다.
 * 라이브러리에 없는 소리는 빠진다
 */
export function sfxGuide(sounds: string[]): string {
	const names = sounds.map((name) => name.normalize("NFC"));
	const find = (name: string) => names.find((file) => stem(file) === name);
	const main = SFX_PALETTE.flatMap((item) => {
		const file = find(item.name);
		return file ? [`- ${file} — ${item.use}`] : [];
	});
	const sometimes = SFX_OCCASIONAL.flatMap((name) => find(name) ?? []);
	const rest = names.filter((file) => !isChannelSfx(file));
	return [
		"# 효과음 목록",
		...(names.length === 0 ? ["(없음. sfx는 전부 null)"] : []),
		...(main.length > 0 ? ["## 주로 쓰는 소리(10번 중 8번은 여기서 고른다)", ...main] : []),
		...(sometimes.length > 0 ? ["## 가끔 쓰는 소리", ...sometimes] : []),
		...(rest.length > 0 ? ["## 그 밖(이름이 상황 설명이다. 위에 맞는 게 없을 때만)", ...rest] : []),
	].join("\n");
}
