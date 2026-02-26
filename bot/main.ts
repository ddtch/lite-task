/**
 * lite-task Telegram Bot — entry point
 *
 * Required env vars (set in .env or shell):
 *   TELEGRAM_BOT_TOKEN  — from @BotFather on Telegram
 *   BOT_HOST_ID         — your Telegram user ID (only you can talk to the bot)
 *   ANTHROPIC_API_KEY   — for Claude (takes priority)
 *   OPENAI_API_KEY      — for GPT-4o-mini (fallback if no Anthropic key)
 *   LITE_TASK_URL       — base URL of the lite-task instance (default: http://localhost:8011)
 *
 * Run:
 *   deno task bot
 *
 * Group setup (BotFather):
 *   Bot Settings → Group Privacy → Turn OFF  (so bot sees all messages, not just commands)
 *
 * Channel setup:
 *   Add bot as channel admin with "Post Messages" permission.
 *   Bot responds only when @mentioned in a channel post.
 */

import { Bot, type Context } from "grammy";
import { runAgent, transcribeAudio } from "./agent.ts";
import { getMessages, saveMessage } from "./store.ts";
import { downloadTelegramFile, isVisionMime, type MediaFile } from "./media.ts";
import { setSessionMedia } from "./tools.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
}

const HOST_ID_RAW = Deno.env.get("BOT_HOST_ID");
if (!HOST_ID_RAW) {
  throw new Error("BOT_HOST_ID environment variable is required");
}
const BOT_HOST_ID = Number(HOST_ID_RAW);
if (!Number.isInteger(BOT_HOST_ID) || BOT_HOST_ID <= 0) {
  throw new Error(`BOT_HOST_ID must be a valid Telegram user ID, got: ${HOST_ID_RAW}`);
}

const bot = new Bot(TELEGRAM_BOT_TOKEN);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMentioned(text: string, username: string | undefined): boolean {
  return Boolean(username && text.toLowerCase().includes(`@${username.toLowerCase()}`));
}

function stripMention(text: string, username: string | undefined): string {
  if (!username) return text;
  return text.replace(new RegExp(`@${username}\\b`, "gi"), "").trim();
}

/** Recent messages from a chat formatted as plain text for the agent. */
function recentMessagesContext(chatId: number, limit = 30): string {
  const msgs = getMessages(chatId, limit);
  if (msgs.length === 0) return "";
  const lines = msgs.map((m) => {
    const d = new Date(m.date * 1000).toISOString().slice(0, 16).replace("T", " ");
    return `[${d}] ${m.from_name}: ${m.text}`;
  });
  return `\n\nRecent messages in this chat:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Groups and private chats  (event: "message:text")
// ---------------------------------------------------------------------------

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const chatType = ctx.chat.type; // "private" | "group" | "supergroup"
  const chatName = "title" in ctx.chat ? (ctx.chat.title ?? "Group") : "Private";
  const from = ctx.message.from?.first_name ?? "Unknown";
  const rawText = ctx.message.text;

  // Persist every message (bot must be member with Privacy Mode OFF for groups)
  saveMessage(chatId, chatName, from, rawText, ctx.message.date);

  // Ignore anyone who isn't the owner
  if (ctx.from?.id !== BOT_HOST_ID) return;

  // In groups: only respond when @mentioned or when replying to bot's message
  if (chatType === "group" || chatType === "supergroup") {
    const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
    if (!isReplyToBot && !isMentioned(rawText, ctx.me.username)) return;
  }

  await ctx.replyWithChatAction("typing");

  const userText = stripMention(rawText, ctx.me.username);

  // Always append recent history so the agent has context for multi-turn flows
  // (e.g. "attach my next voice note to the task" → voice message arrives next).
  const agentInput = (chatType === "group" || chatType === "supergroup")
    ? `[Group: ${chatName}]\n${userText}${recentMessagesContext(chatId)}`
    : `${userText}${recentMessagesContext(chatId)}`;

  try {
    const reply = await runAgent(agentInput);
    await ctx.reply(reply);
  } catch (err) {
    console.error("Agent error:", err);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

// ---------------------------------------------------------------------------
// Channel posts  (event: "channel_post:text")
// Bot must be a channel admin with "Post Messages" permission.
// ---------------------------------------------------------------------------

bot.on("channel_post:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const channelTitle = ctx.chat.title ?? "Channel";
  const rawText = ctx.channelPost.text;

  // Persist all channel posts silently
  saveMessage(chatId, channelTitle, channelTitle, rawText, ctx.channelPost.date);

  // Only respond when @mentioned
  if (!isMentioned(rawText, ctx.me.username)) return;

  const userText = stripMention(rawText, ctx.me.username);
  const agentInput = `[Channel: ${channelTitle}]\n${userText}${recentMessagesContext(chatId)}`;

  try {
    const reply = await runAgent(agentInput);
    await ctx.reply(reply);
  } catch (err) {
    console.error("Channel post agent error:", err);
  }
});

// ---------------------------------------------------------------------------
// Shared helper — download + dispatch any media message to the agent
// ---------------------------------------------------------------------------

async function handleMedia(
  ctx: Context,
  fileId: string,
  defaultMime: string,
  defaultExt: string,
  fallbackText: string,
) {
  if (ctx.from?.id !== BOT_HOST_ID) return;

  await ctx.replyWithChatAction("typing");

  let media: MediaFile | undefined;
  try {
    media = await downloadTelegramFile(TELEGRAM_BOT_TOKEN!, fileId, defaultMime, defaultExt);
  } catch (err) {
    console.error("Media download error:", err);
    await ctx.reply("Sorry, I couldn't download that file. Please try again.");
    return;
  }

  // Caption typed by the user alongside the media (may be empty)
  const caption = ("caption" in ctx.message! && ctx.message.caption) ? ctx.message.caption : "";
  const userText = caption || fallbackText;

  // Append recent chat history so the agent can honour prior instructions
  // (e.g. "attach the next file to task X" sent in a previous message).
  const chatId = ctx.chat!.id;
  const agentInput = `${userText}${recentMessagesContext(chatId)}`;

  // Make file available to the upload_attachment tool
  setSessionMedia(media);
  try {
    // Pass image as vision only if the AI provider supports that MIME type
    const vision = isVisionMime(media.mimeType) ? media : undefined;
    const reply = await runAgent(agentInput, vision);
    await ctx.reply(reply);
  } catch (err) {
    console.error("Agent error:", err);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  } finally {
    setSessionMedia(null);
  }
}

// ---------------------------------------------------------------------------
// Photos  (Telegram always compresses these; send as Document to keep original)
// ---------------------------------------------------------------------------

bot.on("message:photo", async (ctx) => {
  // photo array is sorted smallest → largest; take the last (highest res)
  const photo = ctx.message.photo.at(-1)!;
  await handleMedia(ctx, photo.file_id, "image/jpeg", "jpg", "User sent a photo.");
});

// ---------------------------------------------------------------------------
// Voice messages — transcribe first, then pass to agent
// ---------------------------------------------------------------------------

bot.on("message:voice", async (ctx) => {
  if (ctx.from?.id !== BOT_HOST_ID) return;
  const { voice } = ctx.message;

  await ctx.replyWithChatAction("typing");

  let media: MediaFile;
  try {
    media = await downloadTelegramFile(
      TELEGRAM_BOT_TOKEN!,
      voice.file_id,
      voice.mime_type ?? "audio/ogg",
      "ogg",
    );
  } catch (err) {
    console.error("Voice download error:", err);
    await ctx.reply("Sorry, I couldn't download that voice message. Please try again.");
    return;
  }

  // Attempt transcription (requires OPENAI_API_KEY, works even with Anthropic agent)
  const transcription = await transcribeAudio(media);

  const caption = ctx.message.caption ?? "";
  let userText: string;
  if (transcription) {
    userText = caption
      ? `${caption}\n\n[Voice transcription]: ${transcription}`
      : `[Voice transcription]: ${transcription}\n\nAct on this voice message — create tasks, update status, or answer questions as needed. The audio file is also available to attach via upload_attachment if the user asks.`;
  } else {
    // No transcription available — fall back to plain description
    userText = caption ||
      `User sent a voice message (${voice.duration}s). No transcription available (set OPENAI_API_KEY to enable). You can still attach the audio to a task with upload_attachment.`;
  }

  // Append recent chat history so the agent can honour prior instructions
  // (e.g. "attach my next voice note to task X" sent in a previous message).
  const agentInput = `${userText}${recentMessagesContext(ctx.chat.id)}`;

  setSessionMedia(media);
  try {
    const reply = await runAgent(agentInput);
    await ctx.reply(reply);
  } catch (err) {
    console.error("Agent error:", err);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  } finally {
    setSessionMedia(null);
  }
});

// ---------------------------------------------------------------------------
// Documents / files (includes uncompressed photos sent as files)
// ---------------------------------------------------------------------------

bot.on("message:document", async (ctx) => {
  const { document } = ctx.message;
  const mime = document.mime_type ?? "application/octet-stream";
  const ext = document.file_name?.split(".").pop() ?? "bin";
  const name = document.file_name ?? "file";
  await handleMedia(
    ctx,
    document.file_id,
    mime,
    ext,
    `User sent a file: ${name} (${mime}). You can attach it to a task with upload_attachment.`,
  );
});

// ---------------------------------------------------------------------------
// Audio messages (MP3, M4A — sent via the music/audio attachment option)
// ---------------------------------------------------------------------------

bot.on("message:audio", async (ctx) => {
  const { audio } = ctx.message;
  const ext = audio.file_name?.split(".").pop() ?? "mp3";
  const name = audio.file_name ?? `audio.${ext}`;
  await handleMedia(
    ctx,
    audio.file_id,
    audio.mime_type ?? "audio/mpeg",
    ext,
    `User sent an audio file: ${name}. You can attach it to a task with upload_attachment.`,
  );
});

// ---------------------------------------------------------------------------
// Video messages (MP4 sent as a video, not as a file)
// ---------------------------------------------------------------------------

bot.on("message:video", async (ctx) => {
  const { video } = ctx.message;
  const ext = video.file_name?.split(".").pop() ?? "mp4";
  const name = video.file_name ?? `video.${ext}`;
  await handleMedia(
    ctx,
    video.file_id,
    video.mime_type ?? "video/mp4",
    ext,
    `User sent a video: ${name}. You can attach it to a task with upload_attachment.`,
  );
});

bot.catch((err) => {
  console.error("Bot error:", err.error);
});

console.log("lite-task Telegram bot started.");
bot.start();
