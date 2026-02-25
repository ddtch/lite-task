/**
 * lite-task Telegram Bot — AI agent
 *
 * Provider priority: Anthropic (if ANTHROPIC_API_KEY set) → OpenAI (if OPENAI_API_KEY set)
 * Throws at startup if neither key is present.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { anthropicTools, executeTool, openaiTools } from "./tools.ts";

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
You help users create, update, and review projects and tasks via a chat interface.

Rules:
- When a project name is mentioned, call list_projects first and fuzzy-match the name.
- When creating a task without specifying a project, ask which project to use.
- Be concise — this is a chat, not a document.
- After any write operation, confirm what was done in one sentence.
- Today's date: ${date}`;
}

const MAX_ITERATIONS = 10;

// ---------------------------------------------------------------------------
// Anthropic agent loop
// ---------------------------------------------------------------------------

async function runAnthropic(userMessage: string): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: userMessage }];

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

    // Append assistant turn
    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) break;

    // Execute all tool calls, then append results as a single user turn
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        try {
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
          );
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

async function runOpenAI(userMessage: string): Promise<string> {
  const client = new OpenAI({ apiKey: OPENAI_KEY });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: userMessage },
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

    const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] =
      await Promise.all(
        (choice.message.tool_calls ?? []).map(async (tc) => {
          try {
            const args = JSON.parse(
              tc.function.arguments,
            ) as Record<string, unknown>;
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

export function runAgent(userMessage: string): Promise<string> {
  return USE_ANTHROPIC ? runAnthropic(userMessage) : runOpenAI(userMessage);
}
