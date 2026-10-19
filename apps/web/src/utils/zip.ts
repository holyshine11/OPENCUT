/**
 * Store-only (uncompressed) ZIP with ZIP64 records, for project backups.
 * Media is already compressed, so storing keeps it fast, and building the
 * archive from Blob slices never loads whole videos into memory.
 * readZip also inflates deflated entries, so a backup re-zipped by Finder loads.
 * ponytail: always writes ZIP64 fields; inflated entries become in-memory Blobs
 * (Chrome spills large ones to disk), stream them if huge re-zipped media OOMs.
 */

export interface ZipEntry {
	name: string;
	data: Blob;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIR = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIR = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EXTRA_ID = 0x0001;
const UTF8_FLAG = 0x0800;
const ZIP64_VERSION = 45;
const MAX_32 = 0xffffffff;
const MAX_16 = 0xffff;
const STORE_METHOD = 0;
const DEFLATE_METHOD = 8;
const EOCD_SIZE = 22;
const MAX_COMMENT = 0xffff;
// ZIP64 end record size, counted after its signature and size fields
const ZIP64_END_RECORD_SIZE = 44;
// 1980-01-01, the earliest DOS date; entry dates carry no meaning here
const DOS_DATE = 0x21;

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit++) {
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	return value >>> 0;
});

export async function crc32({ data }: { data: Blob }): Promise<number> {
	let crc = MAX_32;
	const reader = data.stream().getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		for (const byte of value)
			crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ MAX_32) >>> 0;
}

function bytes({
	size,
	write,
}: {
	size: number;
	write: (view: DataView) => void;
}): Uint8Array<ArrayBuffer> {
	const buffer = new Uint8Array(size);
	write(new DataView(buffer.buffer));
	return buffer;
}

export async function writeZip({
	entries,
}: {
	entries: ZipEntry[];
}): Promise<Blob> {
	const parts: BlobPart[] = [];
	const central: Uint8Array<ArrayBuffer>[] = [];
	let offset = 0;

	for (const entry of entries) {
		const name = new TextEncoder().encode(entry.name);
		const crc = await crc32({ data: entry.data });
		const size = entry.data.size;

		const local = bytes({
			size: 30 + name.length + 20,
			write: (view) => {
				view.setUint32(0, LOCAL_HEADER, true);
				view.setUint16(4, ZIP64_VERSION, true);
				view.setUint16(6, UTF8_FLAG, true);
				view.setUint16(8, STORE_METHOD, true);
				view.setUint16(12, DOS_DATE, true);
				view.setUint32(14, crc, true);
				view.setUint32(18, MAX_32, true);
				view.setUint32(22, MAX_32, true);
				view.setUint16(26, name.length, true);
				view.setUint16(28, 20, true);
				new Uint8Array(view.buffer).set(name, 30);
				const extra = 30 + name.length;
				view.setUint16(extra, ZIP64_EXTRA_ID, true);
				view.setUint16(extra + 2, 16, true);
				view.setBigUint64(extra + 4, BigInt(size), true);
				view.setBigUint64(extra + 12, BigInt(size), true);
			},
		});

		central.push(
			bytes({
				size: 46 + name.length + 28,
				write: (view) => {
					view.setUint32(0, CENTRAL_HEADER, true);
					view.setUint16(4, ZIP64_VERSION, true);
					view.setUint16(6, ZIP64_VERSION, true);
					view.setUint16(8, UTF8_FLAG, true);
					view.setUint16(10, STORE_METHOD, true);
					view.setUint16(14, DOS_DATE, true);
					view.setUint32(16, crc, true);
					view.setUint32(20, MAX_32, true);
					view.setUint32(24, MAX_32, true);
					view.setUint16(28, name.length, true);
					view.setUint16(30, 28, true);
					view.setUint32(42, MAX_32, true);
					new Uint8Array(view.buffer).set(name, 46);
					const extra = 46 + name.length;
					view.setUint16(extra, ZIP64_EXTRA_ID, true);
					view.setUint16(extra + 2, 24, true);
					view.setBigUint64(extra + 4, BigInt(size), true);
					view.setBigUint64(extra + 12, BigInt(size), true);
					view.setBigUint64(extra + 20, BigInt(offset), true);
				},
			}),
		);

		parts.push(local, entry.data);
		offset += local.length + size;
	}

	const centralSize = central.reduce((sum, header) => sum + header.length, 0);
	const centralOffset = offset;
	const zip64End = offset + centralSize;
	const count = entries.length;

	parts.push(
		...central,
		bytes({
			size: 56,
			write: (view) => {
				view.setUint32(0, ZIP64_END_OF_CENTRAL_DIR, true);
				view.setBigUint64(4, BigInt(ZIP64_END_RECORD_SIZE), true);
				view.setUint16(12, ZIP64_VERSION, true);
				view.setUint16(14, ZIP64_VERSION, true);
				view.setBigUint64(24, BigInt(count), true);
				view.setBigUint64(32, BigInt(count), true);
				view.setBigUint64(40, BigInt(centralSize), true);
				view.setBigUint64(48, BigInt(centralOffset), true);
			},
		}),
		bytes({
			size: 20,
			write: (view) => {
				view.setUint32(0, ZIP64_LOCATOR, true);
				view.setBigUint64(8, BigInt(zip64End), true);
				view.setUint32(16, 1, true);
			},
		}),
		bytes({
			size: EOCD_SIZE,
			write: (view) => {
				view.setUint32(0, END_OF_CENTRAL_DIR, true);
				view.setUint16(8, Math.min(count, MAX_16), true);
				view.setUint16(10, Math.min(count, MAX_16), true);
				view.setUint32(12, MAX_32, true);
				view.setUint32(16, MAX_32, true);
			},
		}),
	);

	return new Blob(parts, { type: "application/zip" });
}

async function viewOf({
	file,
	start,
	end,
}: {
	file: Blob;
	start: number;
	end: number;
}): Promise<DataView> {
	return new DataView(await file.slice(start, end).arrayBuffer());
}

async function inflate({ data }: { data: Blob }): Promise<Blob> {
	return new Response(
		data.stream().pipeThrough(new DecompressionStream("deflate-raw")),
	).blob();
}

/** Reads a ZIP (with or without ZIP64). Stored entries are lazy slices of the file */
export async function readZip({ file }: { file: Blob }): Promise<ZipEntry[]> {
	const tailStart = Math.max(0, file.size - EOCD_SIZE - MAX_COMMENT);
	const tail = await viewOf({ file, start: tailStart, end: file.size });
	let eocd = -1;
	for (let index = tail.byteLength - EOCD_SIZE; index >= 0; index--) {
		if (tail.getUint32(index, true) === END_OF_CENTRAL_DIR) {
			eocd = index;
			break;
		}
	}
	if (eocd < 0) throw new Error("Not a ZIP file");

	let count = tail.getUint16(eocd + 10, true);
	let centralSize = tail.getUint32(eocd + 12, true);
	let centralOffset = tail.getUint32(eocd + 16, true);
	const locator = eocd - 20;
	if (locator >= 0 && tail.getUint32(locator, true) === ZIP64_LOCATOR) {
		const zip64Offset = Number(tail.getBigUint64(locator + 8, true));
		const zip64 = await viewOf({
			file,
			start: zip64Offset,
			end: zip64Offset + 56,
		});
		if (zip64.getUint32(0, true) !== ZIP64_END_OF_CENTRAL_DIR) {
			throw new Error("Broken ZIP64 record");
		}
		count = Number(zip64.getBigUint64(32, true));
		centralSize = Number(zip64.getBigUint64(40, true));
		centralOffset = Number(zip64.getBigUint64(48, true));
	}

	const central = await viewOf({
		file,
		start: centralOffset,
		end: centralOffset + centralSize,
	});
	const decoder = new TextDecoder();
	const entries: ZipEntry[] = [];
	let cursor = 0;

	for (let index = 0; index < count; index++) {
		if (central.getUint32(cursor, true) !== CENTRAL_HEADER) {
			throw new Error("Broken ZIP central directory");
		}
		const method = central.getUint16(cursor + 10, true);
		if (method !== STORE_METHOD && method !== DEFLATE_METHOD) {
			throw new Error(`Unsupported ZIP compression method ${method}`);
		}
		let size = central.getUint32(cursor + 20, true);
		const uncompressedSize = central.getUint32(cursor + 24, true);
		const nameLength = central.getUint16(cursor + 28, true);
		const extraLength = central.getUint16(cursor + 30, true);
		const commentLength = central.getUint16(cursor + 32, true);
		let localOffset = central.getUint32(cursor + 42, true);
		const name = decoder.decode(
			new Uint8Array(central.buffer, cursor + 46, nameLength),
		);

		// ZIP64 extra holds, in order, only the fields that overflowed above
		let extra = cursor + 46 + nameLength;
		const extraEnd = extra + extraLength;
		while (extra + 4 <= extraEnd) {
			const id = central.getUint16(extra, true);
			const length = central.getUint16(extra + 2, true);
			if (id === ZIP64_EXTRA_ID) {
				let field = extra + 4;
				const next = () => {
					const value = Number(central.getBigUint64(field, true));
					field += 8;
					return value;
				};
				if (uncompressedSize === MAX_32) next();
				if (size === MAX_32) size = next();
				if (localOffset === MAX_32) localOffset = next();
			}
			extra += 4 + length;
		}

		const local = await viewOf({
			file,
			start: localOffset,
			end: localOffset + 30,
		});
		if (local.getUint32(0, true) !== LOCAL_HEADER) {
			throw new Error("Broken ZIP entry");
		}
		const dataStart =
			localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
		const data = file.slice(dataStart, dataStart + size);
		entries.push({
			name,
			data: method === DEFLATE_METHOD ? await inflate({ data }) : data,
		});
		cursor += 46 + nameLength + extraLength + commentLength;
	}

	return entries;
}
