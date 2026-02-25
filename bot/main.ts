/**
 * lite-task Telegram Bot — entry point
 *
 * Required env vars (set in .env or shell):
 *   TELEGRAM_BOT_TOKEN  — from @BotFather on Telegram
 *   ANTHROPIC_API_KEY   — for Claude (takes priority)
 *   OPENAI_API_KEY      — for GPT-4o-mini (fallback if no Anthropic key)
 *   LITE_TASK_URL       — base URL of the lite-task instance (default: http://localhost:8000)
 *
 * Run:
 *   deno task bot
 */

import { Bot } from "grammy";
import { runAgent } from "./agent.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
}

const bot = new Bot(TELEGRAM_BOT_TOKEN);

bot.on("message:text", async (ctx) => {
  // Show typing indicator while the agent works
  await ctx.replyWithChatAction("typing");

  try {
    const reply = await runAgent(ctx.message.text);
    await ctx.reply(reply);
  } catch (err) {
    console.error("Agent error:", err);
    await ctx.reply("Sorry, something went wrong. Please try again.");
  }
});

bot.catch((err) => {
  console.error("Bot error:", err.error);
});

console.log("lite-task Telegram bot started.");
bot.start();
