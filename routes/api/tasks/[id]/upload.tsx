import { define } from "../../../../utils.ts";
import { createAttachment, getTask } from "../../../../db/queries.ts";
import { resolve, extname } from "node:path";

const UPLOADS_DIR = resolve(Deno.cwd(), "data", "uploads");

async function ensureUploadsDir() {
  try {
    await Deno.mkdir(UPLOADS_DIR, { recursive: true });
  } catch {
    // already exists
  }
}

export const handler = define.handlers({
  async POST(ctx) {
    const taskId = Number(ctx.params.id);
    const task = await getTask(taskId);
    if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

    let formData: FormData;
    try {
      formData = await ctx.req.formData();
    } catch {
      return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "file field is required" }, { status: 422 });
    }

    const mime = file.type;
    const baseMime = mime.split(";")[0].trim();
    const isImage = baseMime.startsWith("image/");
    const isAudio = baseMime.startsWith("audio/");
    const isVideo = baseMime.startsWith("video/");
    if (!isImage && !isAudio && !isVideo) {
      return Response.json(
        { error: "Only images, audio, and video files are supported" },
        { status: 422 },
      );
    }

    // audio/webm and audio/ogg are recorded voice memos from the browser
    const VOICE_BASES = new Set(["audio/webm", "audio/ogg"]);
    const attachType = isImage
      ? "image"
      : isVideo
      ? "video"
      : VOICE_BASES.has(baseMime)
      ? "voice"
      : "audio";

    await ensureUploadsDir();

    const ext = extname(file.name) || (isImage ? ".png" : isVideo ? ".mp4" : isAudio ? ".webm" : ".bin");
    const id = globalThis.crypto.randomUUID();
    const filename = `${id}${ext}`;
    const dest = resolve(UPLOADS_DIR, filename);

    const bytes = await file.arrayBuffer();
    await Deno.writeFile(dest, new Uint8Array(bytes));

    const attachmentId = await createAttachment(
      taskId,
      attachType,
      filename,
      file.name,
      mime,
      bytes.byteLength,
    );

    return Response.json({
      id: attachmentId,
      filename,
      url: `/api/uploads/${filename}`,
      type: attachType,
      original_name: file.name,
    }, { status: 201 });
  },
});
