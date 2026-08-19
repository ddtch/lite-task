# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

lite-task — a local-first task manager (projects, tasks, attachments, calendar) built with **Deno 2 + Fresh v2 (JSR) + Preact + Tailwind v4**, with a Telegram AI bot, Retell AI phone-call reminders, and an MCP server. No test suite exists.

## Commands

```bash
deno task dev        # dev server via Vite → http://localhost:8011
deno task check      # fmt --check + lint + type check (run after code changes)
deno task build      # production build → _fresh/
deno task start      # serve production build: deno serve -A --port=8011 _fresh/server.js
deno task preview    # build + start

deno task bot              # Telegram bot (needs .env)
deno task mcp              # MCP server, direct-DB mode (stdio)
deno task mcp:http         # MCP server, HTTP-client mode (talks to LITE_TASK_URL)
deno task calls:scheduler  # reminder scheduler (outbound Retell calls)
deno task events:scheduler # calendar event notifications (Telegram + calls)
```

Dependencies are managed through `deno.json` imports (npm:/jsr: specifiers), not package.json. Install with `deno install --allow-scripts=npm:@tailwindcss/oxide,npm:esbuild,npm:sharp`.

## Architecture

Four processes share one codebase and one database (see `docker-compose.yml`):

1. **Web app** (`main.ts` + `routes/` + `islands/`) — Fresh app. `main.ts` has middleware that injects the project list into `ctx.state.projects` for every non-API request (used by the nav's project switcher). File-system routes: pages in `routes/`, JSON API under `routes/api/`, interactive Preact islands in `islands/`.
2. **Telegram bot** (`bot/main.ts`, grammy) — AI agent (`bot/agent.ts`: Anthropic preferred, OpenAI fallback) that manages tasks via tool calls (`bot/tools.ts`) against the web app's HTTP API (`LITE_TASK_URL`). Only responds to `BOT_HOST_ID`. Message history lives in a **separate** SQLite DB (`data/bot-messages.db`, `bot/store.ts`, uses node:sqlite directly — not the adapter).
3. **Reminder scheduler** (`calls/scheduler.ts`) — polls the `reminders` table every 60s and triggers outbound Retell AI phone calls.
4. **Event scheduler** (`calls/event-scheduler.ts`) — polls calendar `events`: Telegram message and (if `notify_call = 1`) phone call `remind_before` minutes before `event_time`. Untimed events/reminders (but not notes) are notified at 08:00 on their date (`DEFAULT_UNTIMED_NOTIFY_TIME` in `db/queries.ts`). `notify_call` defaults to ON for events and reminders — the default lives in `createEvent`, so callers must pass `undefined` (not `false`) when the flag wasn't given. Timezone-sensitive; the Docker services set `TZ`.

`updateEvent` re-arms `notified_telegram` / `notified_call` / `last_notified_at` whenever a scheduling field (`event_date`, `event_time`, `remind_before`, `remind_interval`) actually changes, so a rescheduled entry notifies again while a title-only edit does not. It lives in the query function rather than a route so every caller — UI, HTTP API, MCP, bot, voice — behaves alike; the schedulers bypass it by writing the flags explicitly.

### Voice calls (Retell)

- `calls/prompt.ts` holds the whole LLM config: `GENERAL_PROMPT`, `BEGIN_MESSAGE` and `DEFAULT_DYNAMIC_VARIABLES`. The agent's first utterance is **not** left to the model — `BEGIN_MESSAGE` is the single variable `{{call_opening}}`, which `buildCallContext()` (`calls/context.ts`) composes server-side so every reminder call states its reason in the opening sentence. Asking the prompt to branch on `{{outbound_mode}}` at runtime was tried and failed: the model opened reminder calls with the generic greeting and denied having called the user.
- **Timezone lives in two places and both must agree**: the agent's `timezone` field (Retell defaults it to `America/Los_Angeles` when unset — that was the original wrong-date bug) and the `Current time: {{current_time_<IANA>}}` anchor at the top of `GENERAL_PROMPT`, whose variable name embeds the zone literally (underscores, case-sensitive IANA name). Both, plus the per-call `{{current_date}}`/`{{current_time}}` values from `buildDateContext()`, derive from `AGENT_TIMEZONE` in `calls/prompt.ts` (`TZ` env var, default `America/New_York`); `update-url` pushes the agent field on every run.
- Retell renders a variable it was not given as the literal `{{name}}`, so anything referenced in the prompt needs an entry in `DEFAULT_DYNAMIC_VARIABLES` for calls that carry no reminder context (web/inbound).
- **Retell versions are immutable once published.** PATCHing a published agent or LLM fails with "Cannot update published agent/LLM", and there is no unpublish endpoint. `calls/update-url.ts` therefore forks a draft with `create-agent-version` (`base_version`), edits the LLM and agent at `?version=<draft>`, then `publish-agent-version`. Editing the draft in place when the latest version is already unpublished is the other branch.
- `update-url` overwrites `general_tools` wholesale from `buildRetellTools()`, so tools added by hand in the Retell dashboard are dropped on the next run — declare them in `calls/tools.ts` (and handle them in `routes/api/voice/tool.ts`) instead.

### Database layer

- `db/database.ts` exports `getDb(): Promise<DbAdapter>` — a memoized singleton. Two adapters behind one async interface: `SqliteAdapter` (node:sqlite, file at `data/task-light.db`) and `TursoAdapter` (`@libsql/client/web`). Turso is used when **both** `TURSO_DB_URL` and `TURSO_API_KEY` are set; otherwise local SQLite. Code must work with both (e.g. `exec()` on Turso splits on `;`).
- **All query functions in `db/queries.ts` are async** — always await them; every route/service goes through this module, never raw SQL in routes.
- Schema lives in `db/database.ts` (`SCHEMA` constant + a `migrations` array of `ALTER TABLE` statements wrapped in try/catch for idempotency). Add new columns by appending to that array.

### MCP server (three modes)

- `mcp/server.ts` — stdio, direct DB access (run from the task-light directory; for Claude Desktop with local DB).
- `mcp/http-client.ts` — stdio, talks to a running instance over HTTP via `LITE_TASK_URL` (for remote/Docker; compile to a binary with `deno task compile-mcp`).
- `routes/mcp.ts` — Streamable HTTP endpoint at `/mcp`, stateless (fresh server + transport per request), for Cursor-style URL-based clients.

## Environment

Config comes from `.env` (see `.env.example`). Key vars: `TELEGRAM_BOT_TOKEN` + `BOT_HOST_ID` (bot), `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` (bot AI, Anthropic wins), `TURSO_DB_URL` + `TURSO_API_KEY` (cloud DB), `RETELL_API_KEY` + `RETELL_AGENT_ID` + `RETELL_FROM_NUMBER` + `REMINDER_TO_NUMBER` (phone calls), `LITE_TASK_URL` (bot/MCP → web app).

All runtime state (SQLite DBs, uploads) lives under `data/` — it's the single Docker volume. Uploads are always on disk even in Turso mode.

## Conventions

- ES modules with destructured imports; `@/` maps to the repo root.
- Deno APIs (`Deno.env.get`, etc.) plus `node:` builtins (node:sqlite, node:path) — this is a Deno project, no Node/npm tooling.
- Lint/format via `deno fmt` and `deno lint` (rules: `fresh`, `recommended`); `_fresh/` is excluded.
