import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { crc32, readZip, writeZip } from "../zip";

const FINDER_REZIPPED_BACKUP = join(
	import.meta.dir,
	"fixtures",
	"finder-rezipped-backup.zip",
);

describe("crc32", () => {
	test("표준 검사값과 같다", async () => {
		expect(await crc32({ data: new Blob(["123456789"]) })).toBe(0xcbf43926);
	});
});

describe("writeZip / readZip", () => {
	test("쓴 항목을 이름·내용 그대로 다시 읽는다", async () => {
		const binary = new Uint8Array(70_000).map((_, index) => index % 251);
		const zip = await writeZip({
			entries: [
				{ name: "project.json", data: new Blob(['{"name":"국밥 영상"}']) },
				{ name: "media/a1/촬영본.mp4", data: new Blob([binary]) },
				{ name: "empty.txt", data: new Blob([]) },
			],
		});

		const entries = await readZip({ file: zip });

		expect(entries.map((entry) => entry.name)).toEqual([
			"project.json",
			"media/a1/촬영본.mp4",
			"empty.txt",
		]);
		expect(await entries[0].data.text()).toBe('{"name":"국밥 영상"}');
		expect(new Uint8Array(await entries[1].data.arrayBuffer())).toEqual(binary);
		expect(entries[2].data.size).toBe(0);
	});

	test("zip이 아닌 파일은 거부한다", async () => {
		await expect(readZip({ file: new Blob(["not a zip"]) })).rejects.toThrow();
	});

	test("Finder(ditto)로 다시 압축한 zip의 압축 항목도 풀어서 읽는다", async () => {
		const entries = await readZip({ file: Bun.file(FINDER_REZIPPED_BACKUP) });
		const bin = entries.find((entry) => entry.name === "국밥 숏폼/media/m1.bin");
		expect(new Uint8Array(await bin!.data.arrayBuffer())).toEqual(
			new Uint8Array(3000).map((_, index) => index % 7),
		);
	});
});
