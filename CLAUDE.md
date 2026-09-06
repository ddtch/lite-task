# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

lite-task — a local-first task manager (projects, tasks, attachments, calendar) built with **Deno 2 + Fresh v2 (JSR) + Preact + Tailwind v4**, with a Telegram AI bot, xAI voice-agent phone-call reminders, and an MCP server. No test suite exists.

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
deno task calls:scheduler  # reminder scheduler (outbound xAI calls)
deno task events:scheduler # calendar event notifications (Telegram + calls)
```

Dependencies are managed through `deno.json` imports (npm:/jsr: specifiers), not package.json. Install with `deno install --allow-scripts=npm:@tailwindcss/oxide,npm:esbuild,npm:sharp`.

## Architecture

Four processes share one codebase and one database (see `docker-compose.yml`):

1. **Web app** (`main.ts` + `routes/` + `islands/`) — Fresh app. `main.ts` has middleware that injects the project list into `ctx.state.projects` for every non-API request (used by the nav's project switcher). File-system routes: pages in `routes/`, JSON API under `routes/api/`, interactive Preact islands in `islands/`.
2. **Telegram bot** (`bot/main.ts`, grammy) — AI agent (`bot/agent.ts`: Anthropic preferred, OpenAI fallback) that manages tasks via tool calls (`bot/tools.ts`) against the web app's HTTP API (`LITE_TASK_URL`). Only responds to `BOT_HOST_ID`. Message history lives in a **separate** SQLite DB (`data/bot-messages.db`, `bot/store.ts`, uses node:sqlite directly — not the adapter).
3. **Reminder scheduler** (`calls/scheduler.ts`) — polls the `reminders` table every 60s and triggers outbound xAI voice-agent phone calls.
4. **Event scheduler** (`calls/event-scheduler.ts`) — polls calendar `events`: Telegram message and (if `notify_call = 1`) phone call `remind_before` minutes before `event_time`. Untimed events/reminders (but not notes) are notified at 08:00 on their date (`DEFAULT_UNTIMED_NOTIFY_TIME` in `db/queries.ts`). `notify_call` defaults to ON for events and reminders — the default lives in `createEvent`, so callers must pass `undefined` (not `false`) when the flag wasn't given. Timezone-sensitive; the Docker services set `TZ`.

`updateEvent` re-arms `notified_telegram` / `notified_call` / `last_notified_at` whenever a scheduling field (`event_date`, `event_time`, `remind_before`, `remind_interval`) actually changes, so a rescheduled entry notifies again while a title-only edit does not. It lives in the query function rather than a route so every caller — UI, HTTP API, MCP, bot, voice — behaves alike; the schedulers bypass it by writing the flags explicitly.

### Voice calls (xAI)

- **The agent is not in this repo.** It lives in the xAI Voice Agent Builder (console.x.ai → Voice → Agents) because `/v1/agents` and `/v1/tools` answer `403 "agents endpoint is not enabled for this team"` — verified against the live API with a key holding `api-key:endpoint:*`, so it is a team feature flag, not a key scope. `calls/prompt.ts` and `calls/tools.ts` stay the source of truth and `deno task calls:tools` prints them for pasting; there is no push-to-agent script.
- What the API does expose, and what this app uses: `GET/PATCH /v2/phone-numbers`, `POST /v1/realtime/client_secrets`, `POST /v1/realtime/calls/{id}/refer|hangup`. Everything else under `/v1/realtime/*` answers `403 "Team is not authorized"` for any path, existing or not — so that error there proves nothing about an endpoint.
- **Outbound calls are the gated part.** `placeOutboundCall()` posts to `XAI_OUTBOUND_PATH` (default `/v1/realtime/calls`) rather than a hardcoded path, and its error carries xAI's response text so a 403 shows up in the scheduler log instead of being swallowed.
- `updatePhoneNumber()` takes a protobuf FieldMask. A path listed in the mask with no matching value **clears** that field — listing `agent_id` without supplying one unbinds the agent from the number. Only `name`, `agent_id`, `webhook_id`, `outbound_sms_enabled` are updatable.
- The agent's first utterance is **not** left to the model: `buildCallContext()` (`calls/context.ts`) composes the whole opening sentence into `call_opening`, and the prompt is told to speak it verbatim. Asking the prompt to branch on the call mode at runtime was tried and failed — the model opened reminder calls with the generic greeting and denied having called the user.
- An unresolved `{{name}}` would reach the model as literal text, so anything the prompt references needs an entry in `DEFAULT_VARIABLES` (`calls/prompt.ts`) for calls with no reminder context. `renderPrompt()` substitutes them server-side as the safety net.
- **Timezone lives in two places and both must agree**: the agent's timezone setting in the Builder and the per-call `{{current_date}}`/`{{current_time}}` values from `buildDateContext()`. Both derive from `AGENT_TIMEZONE` in `calls/prompt.ts` (`TZ` env var, default `America/New_York`); `calls:setup` prints it.

### Database layer

- `db/database.ts` exports `getDb(): Promise<DbAdapter>` — a memoized singleton. Two adapters behind one async interface: `SqliteAdapter` (node:sqlite, file at `data/task-light.db`) and `TursoAdapter` (`@libsql/client/web`). Turso is used when **both** `TURSO_DB_URL` and `TURSO_API_KEY` are set; otherwise local SQLite. Code must work with both (e.g. `exec()` on Turso splits on `;`).
- **All query functions in `db/queries.ts` are async** — always await them; every route/service goes through this module, never raw SQL in routes.
- Schema lives in `db/database.ts` (`SCHEMA` constant + a `migrations` array of `ALTER TABLE` statements wrapped in try/catch for idempotency). Add new columns by appending to that array.

### MCP server (three modes)

- `mcp/server.ts` — stdio, direct DB access (run from the task-light directory; for Claude Desktop with local DB).
- `mcp/http-client.ts` — stdio, talks to a running instance over HTTP via `LITE_TASK_URL` (for remote/Docker; compile to a binary with `deno task compile-mcp`).
- `routes/mcp.ts` — Streamable HTTP endpoint at `/mcp`, stateless (fresh server + transport per request), for Cursor-style URL-based clients.

## Deployment

- Images are published to `ghcr.io/ddtch/lite-task` by `.github/workflows/docker.yml` — one job per architecture on a native runner (`ubuntu-latest`, `ubuntu-24.04-arm`), pushed by digest, then stitched into a manifest list. Do not switch this to a single QEMU job: the build runs Vite, Tailwind's oxide binary and esbuild, which are painfully slow under emulation.
- `docker-compose.yml` pulls that image and never builds; `docker-compose.build.yml` is the override that adds `build: .`. The web port binds to `127.0.0.1` because the app has no login of its own — TLS and authentication belong to a reverse proxy on the host (`deploy/Caddyfile.example`, `deploy/nginx.conf.example`).
- **`/api/voice/*` and `/mcp` must stay reachable without proxy auth**, since the voice agent calls them directly. `main.ts` guards them with `VOICE_API_TOKEN` (`isAgentRoute`), accepted as `Authorization: Bearer`, `X-Lite-Task-Token`, or `?token=`. Unset, they are open and the app warns at startup. Prefer the header: the query form exists only for tool configurations that cannot set headers, and it leaks the secret into access logs.
- The xAI Voice Agent Builder can consume `/mcp` as a remote MCP server with an `Authorization` header (it supports Streamable HTTP and SSE), which is one entry for all of `mcp/toolkit.ts` instead of nine hand-declared HTTP tools. The trade-off is that the MCP tools are id-based while `calls/tools.ts` is name-based for speech. `deno task calls:tools` prints both forms.

## Environment

Config comes from `.env` (see `.env.example`). Key vars: `TELEGRAM_BOT_TOKEN` + `BOT_HOST_ID` (bot), `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` (bot AI, Anthropic wins), `TURSO_DB_URL` + `TURSO_API_KEY` (cloud DB), `XAI_API_KEY` + `XAI_AGENT_ID` + `REMINDER_TO_NUMBER` (phone calls), `LITE_TASK_URL` (bot/MCP → web app).

All runtime state (SQLite DBs, uploads) lives under `data/` — it's the single Docker volume. Uploads are always on disk even in Turso mode.

## Conventions

- ES modules with destructured imports; `@/` maps to the repo root.
- Deno APIs (`Deno.env.get`, etc.) plus `node:` builtins (node:sqlite, node:path) — this is a Deno project, no Node/npm tooling.
- Lint/format via `deno fmt` and `deno lint` (rules: `fresh`, `recommended`); `_fresh/` is excluded.
