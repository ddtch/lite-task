import { define } from "../../../utils.ts";
import { resolve, extname } from "node:path";

const UPLOADS_DIR = resolve(Deno.cwd(), "data", "uploads");

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

export const handler = define.handlers({
  async GET(ctx) {
    // ctx.params["*"] or ctx.params.path holds the wildcard match
    const rawPath = (ctx.params as Record<string, string>)["*"] ??
      (ctx.params as Record<string, string>).path ?? "";

    // Security: no path traversal
    if (rawPath.includes("..") || rawPath.includes("/")) {
      return new Response("Forbidden", { status: 403 });
    }

    const filePath = resolve(UPLOADS_DIR, rawPath);

    let data: Uint8Array;
    try {
      data = await Deno.readFile(filePath);
    } catch {
      return new Response("Not found", { status: 404 });
    }

    const ext = extname(rawPath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new Response(data.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  },
});
