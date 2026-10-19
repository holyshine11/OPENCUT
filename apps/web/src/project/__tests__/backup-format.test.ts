import { describe, expect, test } from "bun:test";
import type {
	MediaAssetData,
	SerializedProject,
} from "@/services/storage/types";
import { packBackup, unpackBackup, renameIfTaken } from "../backup-format";

// 테스트에 필요한 필드만 채운 직렬화 프로젝트
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- 일부 필드만 쓰는 고정 데이터
const project = {
	metadata: {
		id: "p1",
		name: "국밥 숏폼",
		createdAt: "2026-10-19T00:00:00.000Z",
		updatedAt: "2026-10-19T01:00:00.000Z",
	},
	scenes: [],
	currentSceneId: "",
	version: 30,
} as unknown as SerializedProject;

const metadata: MediaAssetData = {
	id: "m1",
	name: "촬영본.mp4",
	type: "video",
	size: 3,
	lastModified: 1,
	width: 1080,
	height: 1920,
};

describe("packBackup / unpackBackup", () => {
	test("프로젝트와 미디어 파일·메타데이터가 그대로 돌아온다", async () => {
		const entries = packBackup({
			project,
			media: [
				{
					metadata,
					file: new File([new Uint8Array([1, 2, 3])], "촬영본.mp4", {
						type: "video/mp4",
					}),
				},
			],
		});
		const restored = await unpackBackup({ entries });

		expect(restored.project).toEqual(project);
		expect(restored.media).toHaveLength(1);
		expect(restored.media[0].metadata).toEqual(metadata);
		expect(restored.media[0].file.name).toBe("촬영본.mp4");
		expect(restored.media[0].file.type).toBe("video/mp4");
		expect(new Uint8Array(await restored.media[0].file.arrayBuffer())).toEqual(
			new Uint8Array([1, 2, 3]),
		);
	});

	test("백업 파일이 아니면 거부한다", async () => {
		await expect(
			unpackBackup({ entries: [{ name: "x.txt", data: new Blob(["x"]) }] }),
		).rejects.toThrow();
	});
});

describe("renameIfTaken", () => {
	test("같은 id가 이미 있으면 새 id와 사본 이름으로 바꾼다", () => {
		const copy = renameIfTaken({
			project,
			takenIds: new Set(["p1"]),
			newId: "p2",
			copyName: "국밥 숏폼 (복원)",
		});
		expect(copy.metadata.id).toBe("p2");
		expect(copy.metadata.name).toBe("국밥 숏폼 (복원)");
		expect(project.metadata.id).toBe("p1");
	});

	test("없으면 그대로 쓴다", () => {
		expect(
			renameIfTaken({
				project,
				takenIds: new Set(),
				newId: "p2",
				copyName: "x",
			}),
		).toBe(project);
	});
});
