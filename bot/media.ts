/**
 * Telegram media download utilities.
 */

export interface MediaFile {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}

/** True if the MIME type can be passed as vision to Anthropic / OpenAI. */
export function isVisionMime(mime: string): boolean {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime);
}

/** Convert binary bytes to a base64 string (chunked to avoid stack overflows). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
};

/**
 * Download a file from Telegram's servers.
 * Step 1: getFile → get file_path.
 * Step 2: fetch the actual bytes.
 */
export async function downloadTelegramFile(
  botToken: string,
  fileId: string,
  defaultMime = "application/octet-stream",
  defaultExt = "bin",
): Promise<MediaFile> {
  const infoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const info = await infoRes.json() as { ok: boolean; result?: { file_path: string } };
  if (!info.ok || !info.result) {
    throw new Error(`getFile failed for file_id ${fileId}`);
  }

  const filePath = info.result.file_path;
  const ext = filePath.split(".").pop()?.toLowerCase() ?? defaultExt;

  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`,
  );
  if (!fileRes.ok) {
    throw new Error(`File download failed (${fileRes.status}): ${fileRes.statusText}`);
  }

  const bytes = new Uint8Array(await fileRes.arrayBuffer());
  const mimeType = EXT_TO_MIME[ext] ?? defaultMime;
  const filename = `telegram-${Date.now()}.${ext}`;

  return { bytes, mimeType, filename };
}
