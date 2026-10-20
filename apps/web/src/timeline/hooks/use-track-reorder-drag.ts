import { useRef, useState, type RefObject } from "react";

// 이만큼 움직여야 끌기로 본다. 덜 움직이면 클릭(트랙 고르기)이다
const DRAG_THRESHOLD_PX = 4;

export interface TrackReorderDrag {
	trackId: string;
	/** 끼워 넣을 자리를 보여 주는 선의 위치(목록 위에서 떨어진 px) */
	indicatorTop: number;
}

/**
 * 트랙 머리를 위아래로 끌어 순서를 바꾼다. 같은 영역(zones의 한 배열) 안에서만 움직이고,
 * 놓으면 onMove에 옮기기 전 영역 배열 기준의 끼워 넣을 자리를 준다.
 * 행은 data-track-row-id 속성으로 찾는다
 */
export function useTrackReorderDrag({
	listRef,
	zones,
	onMove,
}: {
	listRef: RefObject<HTMLElement | null>;
	zones: readonly (readonly string[])[];
	onMove: (params: { trackId: string; toIndex: number }) => void;
}) {
	const [drag, setDrag] = useState<TrackReorderDrag | null>(null);
	const suppressClickRef = useRef(false);

	const findDrop = ({
		zone,
		clientY,
	}: {
		zone: readonly string[];
		clientY: number;
	}) => {
		const list = listRef.current;
		if (!list) return null;
		const listTop = list.getBoundingClientRect().top;
		const rows = zone.flatMap((id, index) => {
			const row = list.querySelector(`[data-track-row-id="${CSS.escape(id)}"]`);
			return row ? [{ index, rect: row.getBoundingClientRect() }] : [];
		});
		if (rows.length === 0) return null;
		const before = rows.find(
			({ rect }) => clientY < rect.top + rect.height / 2,
		);
		const last = rows[rows.length - 1];
		return before
			? { toIndex: before.index, indicatorTop: before.rect.top - listTop }
			: { toIndex: last.index + 1, indicatorTop: last.rect.bottom - listTop };
	};

	const onPointerDown = ({
		event,
		trackId,
	}: {
		event: React.PointerEvent;
		trackId: string;
	}) => {
		if (event.button !== 0) return;
		const zone = zones.find((ids) => ids.includes(trackId));
		// 옮길 수 있는 목록에 없는 트랙은 끌지 않는다
		if (!zone) return;

		const startY = event.clientY;
		let toIndex: number | null = null;

		const handleMove = (moveEvent: PointerEvent) => {
			if (
				toIndex === null &&
				Math.abs(moveEvent.clientY - startY) < DRAG_THRESHOLD_PX
			) {
				return;
			}
			const drop = findDrop({ zone, clientY: moveEvent.clientY });
			if (!drop) return;
			toIndex = drop.toIndex;
			document.body.style.cursor = "grabbing";
			setDrag({ trackId, indicatorTop: drop.indicatorTop });
		};

		const handleUp = () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleUp);
			document.body.style.cursor = "";
			setDrag(null);
			if (toIndex === null) return;
			// 끈 뒤 따라오는 클릭이 트랙 선택을 바꾸지 않게 한 번 막는다
			suppressClickRef.current = true;
			setTimeout(() => {
				suppressClickRef.current = false;
			});
			onMove({ trackId, toIndex });
		};

		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp);
	};

	return {
		drag,
		onPointerDown,
		shouldSuppressClick: () => suppressClickRef.current,
	};
}
