import settings from "./chapters.json";

export type ChapterSettings = typeof settings;
export interface ChapterCue {
	text: string;
	start: number;
	end: number;
}
export interface Chapter {
	start: number;
	title: string;
}

/**
 * 자막에서 유튜브 챕터 초안을 만든다. 경계 점수는 자막 사이 쉼 길이, 앞뒤 `window`개 자막의 낱말이 바뀌는 정도,
 * "이제·먼저" 같은 전환 말로 시작하는지를 더한다(youtube-agent-skill chapters.py 아이디어, MIT).
 * 제목은 챕터 첫 자막 앞부분이다. 사람이 고쳐 쓰는 초안이다
 */
export function proposeChapters({
	cues,
	options = settings,
}: {
	cues: readonly ChapterCue[];
	options?: ChapterSettings;
}): Chapter[] {
	if (cues.length < options.minCues) return [];
	const duration = cues.at(-1)?.end ?? 0;
	const words = cues.map((cue) => keywords({ text: cue.text, options }));
	const union = ({ from, to }: { from: number; to: number }) => new Set(words.slice(Math.max(0, from), to).flat());

	// 문장부호가 있는 자막이면 앞 자막이 문장으로 끝난 곳에서만 나눈다. 문장 중간에서 끊긴 제목을 막는다
	const endsSentence = (i: number) => /[.?!…"]$/u.test(cues[i].text.trim());
	const sentenceStarts = cues.slice(1).filter((_, index) => endsSentence(index)).length;
	const candidates = cues.slice(1).flatMap((cue, index) => {
		const i = index + 1;
		if (sentenceStarts >= options.target && !endsSentence(i - 1)) return [];
		// 앞뒤 창 크기를 같게 해야 영상 끝처럼 한쪽이 짧은 곳의 낱말 변화가 부풀지 않는다
		const size = Math.min(options.window, i, cues.length - i);
		if (size < options.window / 2) return [];
		const before = union({ from: i - size, to: i });
		const after = union({ from: i, to: i + size });
		const all = new Set([...before, ...after]);
		const shared = [...before].filter((word) => after.has(word)).length;
		const shift = all.size ? 1 - shared / all.size : 0;
		const gap = Math.max(0, cue.start - cues[i - 1].end);
		const firstWord = cue.text.trim().split(/[\s,.]+/)[0] ?? "";
		const marker = options.markers.includes(firstWord) ? 1 : 0;
		return [{ i, score: gap * options.gapWeight + shift * options.shiftWeight + marker * options.markerWeight }];
	});

	// 챕터가 한곳에 몰리지 않게 간격은 영상 길이를 목표 개수의 두 배로 나눈 값 이상
	const spacing = Math.max(options.minSeconds, duration / (options.target * 2));
	const picked = [0];
	const sorted = candidates.sort((a, b) => b.score - a.score);
	// 목표 개수를 억지로 채우지 않는다. 가장 뚜렷한 경계에 견줘 약한 곳은 버린다
	const floor = (sorted[0]?.score ?? 0) * options.minScoreRatio;
	for (const { i, score } of sorted) {
		if (picked.length >= options.target || score < floor) break;
		const start = cues[i].start;
		const farFromOthers = picked.every((p) => Math.abs(start - (p === 0 ? 0 : cues[p].start)) >= spacing);
		if (farFromOthers && duration - start >= spacing) picked.push(i);
	}
	return picked
		.sort((a, b) => a - b)
		.map((i) => {
			// 앞 자막이 문장 중간에서 끊겼으면 이 자막의 첫 문장 조각은 앞 이야기라 다음 문장부터 제목으로 쓴다
			const text = i > 0 && !endsSentence(i - 1) ? cues[i].text.replace(/^[^.?!…]*[.?!…]+\s+(?=\S)/u, "") : cues[i].text;
			return { start: i === 0 ? 0 : cues[i].start, title: titleOf({ text, options }) };
		});
}

/** 설명란에 붙일 블록. 유튜브는 첫 항목 0:00, 3개 이상, 각 `minSeconds`초 이상이어야 챕터로 보여 주고 아니면 조용히 무시한다 */
export function formatChapters({
	chapters,
	duration,
	options = settings,
}: {
	chapters: readonly Chapter[];
	duration: number;
	options?: ChapterSettings;
}): { text: string; valid: boolean } {
	const valid =
		chapters.length >= 3 &&
		chapters[0].start === 0 &&
		chapters.every((chapter, i) => (chapters[i + 1]?.start ?? duration) - chapter.start >= options.minSeconds);
	const text = chapters.map((chapter) => `${timestamp({ seconds: chapter.start })} ${chapter.title}`).join("\n");
	return { text, valid };
}

export function timestamp({ seconds }: { seconds: number }): string {
	const total = Math.floor(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = String(total % 60).padStart(2, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** 두 글자 이상 낱말에서 흔한 조사 꼬리를 하나 뗀다. 형태소 분석 없이 주제가 바뀌는지만 보려는 것이다 */
function keywords({ text, options }: { text: string; options: ChapterSettings }): string[] {
	return text
		.toLowerCase()
		.split(/\s+/)
		.map((word) => word.replace(/[\p{P}\p{S}]/gu, ""))
		.filter((word) => !options.stopWords.includes(word))
		.map((word) => {
			const particle = options.particles.find((p) => word.length > p.length + 1 && word.endsWith(p));
			return particle ? word.slice(0, -particle.length) : word;
		})
		.filter((word) => word.length >= 2 && !options.stopWords.includes(word));
}

function titleOf({ text, options }: { text: string; options: ChapterSettings }): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= options.maxTitleChars) return clean.replace(/[.,!?…]+$/u, "");
	const cut = clean.slice(0, options.maxTitleChars);
	const words = cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length);
	return `${words.replace(/[.,!?…]+$/u, "")}…`;
}
