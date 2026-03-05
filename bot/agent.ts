/**
 * lite-task Telegram Bot — AI agent
 *
 * Provider priority: Anthropic (if ANTHROPIC_API_KEY set) → OpenAI (if OPENAI_API_KEY set)
 * Throws at startup if neither key is present.
 *
 * Supports vision (photos) and file attachment via the upload_attachment tool.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { anthropicTools, executeTool, openaiTools } from "./tools.ts";
import { bytesToBase64, isVisionMime, type MediaFile } from "./media.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

if (!ANTHROPIC_KEY && !OPENAI_KEY) {
  throw new Error(
    "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment.",
  );
}

const USE_ANTHROPIC = Boolean(ANTHROPIC_KEY);

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const date = new Date().toISOString().split("T")[0];
  return `You are a task management assistant for lite-task.
You help users create, update, and review projects, tasks, and calendar events via a chat interface.
You operate in private chats, Telegram groups, and channels.

Rules:
- When a project name is mentioned, call list_projects first and fuzzy-match the name.
- When creating a task without specifying a project, ask which project to use.
- Tasks can have an optional due_date (YYYY-MM-DD). Set it when the user mentions a deadline. Use update_task to change or clear it.
- Be concise — this is a chat, not a document.
- After any write operation, confirm what was done in one sentence.
- You can create calendar events, notes, and reminders using create_event. Use type "event" for appointments, "note" for notes on a day, and "reminder" for reminders. Always include event_date in YYYY-MM-DD format. Use list_events to check existing entries.
- Timed events (with event_time) get a notification before the event. Use remind_before to set how far in advance (5, 10, 30, 60, 1440, or 2880 minutes; default 10). Set notify_call to true for a phone call too. Use remind_interval ('hourly' or 'daily') for recurring reminders that repeat until the event.
- Messages may start with [Group: name] or [Channel: name] — that's the source context, not part of the request.
- If "Recent messages in this chat:" is present, use that conversation history to extract action items or answer questions.
- When extracting tasks from a conversation, identify ALL distinct action items and create them all in one go.
- When the user sends a photo, you can see its content. Analyse it and act on what you see.
- When the user sends a voice message, file, or photo and wants to attach it to a task, call upload_attachment with the task_id. Never say you cannot handle files.
- When a message contains [Voice transcription]: ..., treat that text as the user's spoken words and act on them — create tasks, update status, answer questions, etc. The audio file is also available to attach.
- If "Recent messages in this chat:" shows the user previously said to attach their next file/voice note to a task, honour that instruction now — call upload_attachment automatically without asking again.
- Today's date: ${date}`;
}

const MAX_ITERATIONS = 10;

// ---------------------------------------------------------------------------
// Anthropic agent loop
// ---------------------------------------------------------------------------

async function runAnthropic(userMessage: string, vision?: MediaFile): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  // Build the first user message — with or without an inline image
  // deno-lint-ignore no-explicit-any
  const firstContent: any = vision && isVisionMime(vision.mimeType)
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: vision.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: bytesToBase64(vision.bytes),
          },
        },
        { type: "text", text: userMessage },
      ]
    : userMessage;

  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: firstContent }];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      system: buildSystemPrompt(),
      messages,
      // deno-lint-ignore no-explicit-any
      tools: anthropicTools as any,
      max_tokens: 1024,
    });

    if (response.stop_reason === "end_turn") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }

    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) break;

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        try {
          const result = await executeTool(block.name, block.input as Record<string, unknown>);
          return { type: "tool_result" as const, tool_use_id: block.id, content: result };
        } catch (err) {
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          };
        }
      }),
    );

    messages.push({ role: "user", content: toolResults });
  }

  return "I was unable to complete the request. Please try again.";
}

// ---------------------------------------------------------------------------
// OpenAI agent loop
// ---------------------------------------------------------------------------

async function runOpenAI(userMessage: string, vision?: MediaFile): Promise<string> {
  const client = new OpenAI({ apiKey: OPENAI_KEY });

  // Build first user message content
  const firstContent: OpenAI.Chat.ChatCompletionContentPart[] =
    vision && isVisionMime(vision.mimeType)
      ? [
          {
            type: "image_url",
            image_url: {
              url: `data:${vision.mimeType};base64,${bytesToBase64(vision.bytes)}`,
            },
          },
          { type: "text", text: userMessage },
        ]
      : [{ type: "text", text: userMessage }];

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: firstContent },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: openaiTools as OpenAI.Chat.ChatCompletionTool[],
    });

    const choice = response.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason === "stop") {
      return choice.message.content ?? "";
    }

    if (choice.finish_reason !== "tool_calls") break;

    const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = await Promise.all(
      (choice.message.tool_calls ?? []).map(async (tc) => {
        try {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          const result = await executeTool(tc.function.name, args);
          return { role: "tool" as const, tool_call_id: tc.id, content: result };
        } catch (err) {
          return {
            role: "tool" as const,
            tool_call_id: tc.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }),
    );

    messages.push(...toolResults);
  }

  return "I was unable to complete the request. Please try again.";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function runAgent(userMessage: string, vision?: MediaFile): Promise<string> {
  return USE_ANTHROPIC ? runAnthropic(userMessage, vision) : runOpenAI(userMessage, vision);
}

// ---------------------------------------------------------------------------
// Voice transcription (OpenAI Whisper — used regardless of agent provider)
// ---------------------------------------------------------------------------

export async function transcribeAudio(media: MediaFile): Promise<string | null> {
  if (!OPENAI_KEY) return null;
  try {
    const client = new OpenAI({ apiKey: OPENAI_KEY });
    const file = new File([media.bytes as Uint8Array<ArrayBuffer>], media.filename, { type: media.mimeType });
    const result = await client.audio.transcriptions.create({
      model: "whisper-1",
      file,
    });
    return result.text.trim() || null;
  } catch (err) {
    console.error("Transcription error:", err);
    return null;
  }
}
