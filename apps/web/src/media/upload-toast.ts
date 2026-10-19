import { toast } from "sonner";
import { getMessages } from "@/i18n";

export interface MediaUploadToastResult {
	uploadedCount: number;
	assetNames?: string[];
}

function waitForNextPaint(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve());
		});
	});
}

export async function showMediaUploadToast<T extends MediaUploadToastResult>({
	filesCount,
	promise,
}: {
	filesCount: number;
	promise: Promise<T> | (() => Promise<T>);
}) {
	const run = typeof promise === "function" ? promise : () => promise;
	const m = getMessages().notices.media;
	const toastPromise = toast.promise(async () => {
		await waitForNextPaint();
		return run();
	}, {
		loading: m.uploading({ count: filesCount }),
		success: ({ uploadedCount, assetNames }) => {
			if (uploadedCount === 1) {
				const assetName = assetNames?.[0];
				return assetName
					? m.uploadedNamed({ name: assetName })
					: m.uploadedCount({ count: 1 });
			}

			if (uploadedCount > 1) {
				return m.uploadedCount({ count: uploadedCount });
			}

			return m.noneUploaded;
		},
		error: m.uploadFailed({ count: filesCount }),
	});

	return toastPromise.unwrap();
}
