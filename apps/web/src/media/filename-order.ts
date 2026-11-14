/**
 * 파일명 순서: 숫자 0~9 → 영문 대문자 → 영문 소문자 → 한글. 코드 포인트 순서가 바로 이 순서다.
 * 숫자 덩어리는 값으로 비교해 2.mp4가 10.mp4보다 앞에 온다
 */
export function compareFileNames(a: string, b: string): number {
	const pa = a.match(/\d+|\D/g) ?? [];
	const pb = b.match(/\d+|\D/g) ?? [];
	for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
		const x = pa[i];
		const y = pb[i];
		if (x === y) continue;
		const isNumX = /^\d/.test(x);
		const isNumY = /^\d/.test(y);
		if (isNumX && isNumY) {
			const diff = Number(x) - Number(y);
			if (diff !== 0) return diff;
			return x.length - y.length;
		}
		return x < y ? -1 : 1;
	}
	return pa.length - pb.length;
}
