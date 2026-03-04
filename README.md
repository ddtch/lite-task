# lite-task

A local-first task manager with **projects**, **tasks**, **attachments** (images, audio, video, voice memos), and a **Telegram AI bot** — built with Deno, Fresh 2, and SQLite (or Turso).

Designed to also act as an **MCP server** so Claude (or Claude Desktop) can read and manage your tasks directly from conversations.

---

## Features

- **Projects** — organize work into projects
- **Tasks** — title, description, priority (`low` / `medium` / `high`), status (`todo` / `in_progress` / `done`)
- **Board & list views** — toggle between a kanban board (with drag & drop) and a grouped list view
- **Attachments** — drag & drop images, upload audio files (MP3, M4A), upload video files (MP4), or record voice memos per task
- **Image lightbox** — click any image attachment to view it full-screen with prev/next navigation
- **Clickable links** — URLs in task descriptions are automatically rendered as links
- **Calendar** — interactive calendar (FullCalendar) with events, notes, and reminders; month/week/day/year views; per-day event panel with inline create/edit/delete; stats bar
- **Event notifications** — Telegram message 10 min before timed events; optional phone call (Retell AI) 5 min before
- **SQLite or Turso** — local SQLite by default; switch to Turso cloud database via env vars
- **REST API** — clean JSON API for programmatic access
- **MCP server** — two modes: direct DB (local) or HTTP client (remote/Docker)
- **Telegram bot** — AI-powered bot (Claude or GPT-4o-mini) that manages tasks via natural language, supports voice transcription and media attachments

---

## Quick start (local)

Requires [Deno 2.2+](https://docs.deno.com/runtime/getting_started/installation/).

```bash
git clone https://github.com/your-org/lite-task
cd lite-task/task-light

deno task dev
# → http://localhost:8011
```

The SQLite database (`data/task-light.db`) and uploads (`data/uploads/`) are created automatically on first run inside the `data/` directory.

> **Arc browser users:** the dev server uses a custom Vite protocol scheme that Arc blocks. Use `deno task preview` (production build) for full functionality, or open in Chrome/Firefox.

---

## Database

### Local SQLite (default)

No configuration needed. The database is created at `data/task-light.db` relative to the working directory on first run.

### Turso (cloud SQLite)

[Turso](https://turso.tech) is a libSQL-based cloud database. When `TURSO_DB_URL` and `TURSO_API_KEY` are both set, the app connects to Turso instead of local SQLite — no other changes needed.

```env
TURSO_DB_URL=libsql://your-database.turso.io
TURSO_API_KEY=your-auth-token
```

Get these from the [Turso dashboard](https://app.turso.tech) or the `turso` CLI:

```bash
turso db create lite-task
turso db show lite-task --url
turso db tokens create lite-task
```

> When using Turso in Docker, the `data/task-light.db` file is never written. Uploaded files (images, audio, video) still need the `data/uploads/` volume — those are stored on disk regardless of DB mode.

---

## Running in production (without Docker)

```bash
# 1. Install dependencies
deno install --allow-scripts=npm:@tailwindcss/oxide,npm:esbuild,npm:sharp

# 2. Build the Fresh app
deno task build

# 3. Serve
deno task start
# → http://localhost:8011
```

To change the port:

```bash
deno serve -A --port=3000 --host=0.0.0.0 _fresh/server.js
```

---

## Docker (recommended for self-hosting)

### Option A — Docker Compose (easiest)

```bash
git clone https://github.com/your-org/lite-task
cd lite-task/task-light

# Copy and fill in env vars
cp .env.example .env

docker compose up -d
# → http://localhost:8011
```

All three services (`lite-task`, `bot`, and `event-scheduler`) read from `.env` automatically via Docker's `env_file` directive. If `TURSO_DB_URL` and `TURSO_API_KEY` are present the app uses Turso; otherwise it uses local SQLite.

**Persistent data** is stored under `./data/` on the host:

```
./data/
  task-light.db       ← SQLite DB (local mode only; unused when Turso is active)
  bot-messages.db     ← Telegram message history (always local SQLite)
  uploads/            ← uploaded images, audio, and video files
```

Docker creates the `data/` directory on first run. SQLite files are created automatically — nothing to pre-create.

To change the port:

```bash
PORT=3000 docker compose up -d
```

### Option B — Docker directly

```bash
# Build image
docker build -t lite-task .

# Run with persistent data
docker run -d \
  --name lite-task \
  -p 8011:8011 \
  -v "$(pwd)/data:/app/data" \
  --env-file .env \
  --restart unless-stopped \
  lite-task
```

### Updating

```bash
docker compose down
git pull
docker compose up -d --build
```

---

## MCP Server — integrate with AI tools

lite-task ships **three MCP server modes**. Pick one based on your setup.

### Mode 1: Built-in HTTP endpoint (easiest — recommended for Cursor)

The app exposes an MCP endpoint at `/mcp` using the [Streamable HTTP transport](https://spec.modelcontextprotocol.io/specification/basic/transports/#streamable-http). No subprocess, no env vars — just point your tool at the URL.

Works whenever the app is running (locally or in Docker).

#### Configure Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "lite-task": {
      "url": "http://localhost:8011/mcp"
    }
  }
}
```

That's it. Reload MCP servers in Cursor (`Cmd+Shift+P` → "MCP: Reload Servers").

---

### Mode 2: HTTP client (binary / Deno)

Connects to any running lite-task instance over HTTP via stdio. Works whether the app runs locally, in Docker, or on a remote server. Can be compiled to a **standalone binary** — no Deno required on the machine running the AI tool.

#### Step 1 — compile the binary (once) — optional

```bash
cd task-light
deno task compile-mcp
# → produces ./lite-task-mcp

# Move somewhere permanent
mv lite-task-mcp ~/.local/bin/          # Linux / macOS
```

Or skip compilation and use Deno directly — see configs below.

---

### Configure Claude Desktop

Config file locations:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

**With compiled binary:**

```json
{
  "mcpServers": {
    "lite-task": {
      "command": "/Users/you/.local/bin/lite-task-mcp",
      "env": {
        "LITE_TASK_URL": "http://localhost:8011"
      }
    }
  }
}
```

**With Deno (no compilation needed):**

```json
{
  "mcpServers": {
    "lite-task": {
      "command": "deno",
      "args": ["run", "-A", "/path/to/task-light/mcp/http-client.ts"],
      "env": {
        "LITE_TASK_URL": "http://localhost:8011"
      }
    }
  }
}
```

After editing, restart Claude Desktop. You should see the lite-task tools listed under the hammer icon in a new conversation.

---

### Configure Cursor

> **Recommended:** use Mode 1 (built-in HTTP endpoint) — just `"url": "http://localhost:8011/mcp"` with no subprocess.

Alternatively, with the compiled binary or Deno:

```json
{
  "mcpServers": {
    "lite-task": {
      "command": "/Users/you/.local/bin/lite-task-mcp",
      "env": {
        "LITE_TASK_URL": "http://localhost:8011"
      }
    }
  }
}
```

---

### Configure Claude Code (CLI)

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "lite-task": {
      "command": "/Users/you/.local/bin/lite-task-mcp",
      "env": {
        "LITE_TASK_URL": "http://localhost:8011"
      }
    }
  }
}
```

You can also scope it to a single project by placing the same config in `.claude/settings.json` at the project root.

Restart Claude Code after editing. Run `/mcp` in a session to confirm the server is connected.

---

### Mode 3: Direct DB access (local only)

When lite-task and the AI tool run on the same machine, this mode skips HTTP entirely and reads SQLite directly — no web server needed.

```json
{
  "mcpServers": {
    "lite-task": {
      "command": "deno",
      "args": ["run", "-A", "/path/to/task-light/mcp/server.ts"],
      "cwd": "/path/to/task-light"
    }
  }
}
```

> The `cwd` must point to `task-light/` so the server resolves `data/task-light.db` correctly. This mode does not support Turso — it always reads the local SQLite file.

---

### Available MCP tools


| Tool             | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `list_projects`  | List all projects with task counts                        |
| `create_project` | Create a new project                                      |
| `get_project`    | Get a project with its tasks                              |
| `delete_project` | Delete a project and all its tasks                        |
| `list_tasks`     | List tasks — filter by `project_id`, `status`, `priority` |
| `create_task`    | Create a task in a project                                |
| `get_task`       | Get task details including attachments                    |
| `update_task`    | Update title, description, status, or priority            |
| `delete_task`    | Delete a task                                             |
| `get_attachment` | Download an attachment image and return it as base64      |
| `list_events`   | List calendar events — filter by `month`, `project_id`    |
| `create_event`  | Create a calendar event, note, or reminder (+ `notify_call` for phone reminder) |
| `get_event`     | Get a calendar event by ID                                |
| `update_event`  | Update event fields including `notify_call`               |
| `delete_event`  | Delete a calendar event                                   |


---

## Publishing the MCP binary

The MCP HTTP client (`mcp/http-client.ts`) compiles to a standalone binary. The `.github/workflows/release.yml` workflow automates this: push a version tag and it cross-compiles for all five targets and creates a GitHub Release.

```bash
git tag v0.1.0
git push origin v0.1.0
# → GitHub Actions builds and publishes the release automatically
```

### npm

```bash
cd npm-package
npm publish
```

Users install with:

```bash
npm install -g lite-task-mcp
```

### Homebrew

Homebrew requires a tap repo named `homebrew-lite-task`. After each release, update the `sha256` values in the formula using `checksums.txt` from the GitHub Release.

```bash
brew tap your-org/lite-task
brew install lite-task-mcp
```

### Shell script (universal)

```bash
curl -fsSL https://raw.githubusercontent.com/your-org/lite-task/main/task-light/install.sh | sh
```

---

## Telegram Bot

lite-task ships a Telegram bot that accepts natural-language messages and uses an AI agent (Claude or GPT-4o-mini) to read and manage your tasks.

**Examples:**

- "List my projects"
- "Create a task called Fix login bug in project Personal with high priority"
- "What tasks are in progress?"
- "Add an event called Team standup on 2026-03-10 at 10:00"
- "Create a reminder for March 15 — submit tax forms"
- "What events do I have this month?"
- Send a voice message — it gets transcribed and the agent acts on the spoken words
- Send a photo or file — the agent can attach it to any task

### Setup

#### 1. Create a bot on Telegram

Talk to [@BotFather](https://t.me/BotFather), send `/newbot`, follow the prompts, copy the token. To find your user ID, message [@userinfobot](https://t.me/userinfobot).

#### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
LITE_TASK_URL=http://localhost:8011    # or wherever lite-task runs
TELEGRAM_BOT_TOKEN=<token from BotFather>
BOT_HOST_ID=<your Telegram user ID>   # restricts bot to you only
ANTHROPIC_API_KEY=<your key>          # takes priority over OpenAI
OPENAI_API_KEY=<your key>             # fallback agent; also enables voice transcription (Whisper)
```

`BOT_HOST_ID` is required — the bot only responds to messages from this user ID, even in groups and channels it joins.

#### 3. Run the bot

```bash
# Terminal 1 — web app
deno task dev

# Terminal 2 — Telegram bot
deno task bot
```

#### 4. Docker (run both together)

```bash
docker compose up -d
```

The `bot` and `event-scheduler` services start automatically after the `lite-task` service passes its health check. All services share the `./data` volume, so databases persist across restarts.

### AI provider


| Env var             | Provider         | Model             |
| ------------------- | ---------------- | ----------------- |
| `ANTHROPIC_API_KEY` | Anthropic Claude | claude-sonnet-4-6 |
| `OPENAI_API_KEY`    | OpenAI           | gpt-4o-mini       |


Set one or both. Anthropic takes priority if both are present.

### Voice transcription

When you send a voice message, it is automatically transcribed using **OpenAI Whisper** (`whisper-1`) and the transcript is passed to the agent — which can create tasks, update descriptions, or answer questions based on what you said. The audio file is also available to attach to any task.

Transcription requires `OPENAI_API_KEY`. Without it, the bot falls back to handling the voice file as a plain attachment.

### Media support


| Telegram type   | Stored as                  |
| --------------- | -------------------------- |
| Photo           | `image`                    |
| Voice message   | `voice`                    |
| Audio (MP3/M4A) | `audio`                    |
| Video (MP4)     | `video`                    |
| Document/file   | auto-detected by MIME type |


### Groups and channels

Add the bot to a Telegram group or channel. It saves all messages it sees to `data/bot-messages.db`. From your private chat with the bot, you can ask it to read group history:

- "What was discussed in the team group today?"
- "Create tasks from the last 20 messages in the project channel"

In groups, the bot only responds when @mentioned or when replying to its own message.

---

## Voice Calling (Retell AI)

lite-task integrates with [Retell AI](https://www.retellai.com/) for voice-based task management. You can call the agent by phone or from the browser, and the agent can call you back with reminders.

**What you can do by voice:**

- "Create a task called Fix login bug in project Personal"
- "What tasks are in progress?"
- "Mark the deploy task as done"
- "Remind me about the deadline tomorrow at 3pm"

### Setup

#### 1. Create a Retell AI account

Sign up at [retellai.com](https://www.retellai.com/) and purchase a phone number.

#### 2. Configure environment variables

Add to `.env`:

```env
RETELL_API_KEY=<your Retell API key>
APP_BASE_URL=<public URL for webhooks, e.g. https://your-domain.com or ngrok URL>
```

#### 3. Create the voice agent

```bash
deno task calls:setup
```

This creates a Retell LLM + Agent with task management tools. Copy the output into `.env`:

```env
RETELL_AGENT_ID=<from setup output>
RETELL_LLM_ID=<from setup output>
```

#### 4. Bind to phone number

In the [Retell Dashboard](https://dashboard.retellai.com), assign the agent to your phone number for both inbound and outbound calls. Or via API:

```bash
curl -X PATCH "https://api.retellai.com/update-phone-number/+1XXXXXXXXXX" \
  -H "Authorization: Bearer $RETELL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"inbound_agent_id": "<RETELL_AGENT_ID>", "outbound_agent_id": "<RETELL_AGENT_ID>"}'
```

#### 5. Configure reminders (optional)

For outbound reminder calls, add:

```env
RETELL_FROM_NUMBER=+1XXXXXXXXXX    # your Retell phone number
REMINDER_TO_NUMBER=+1YYYYYYYYYY    # your personal number
```

Run the reminder scheduler:

```bash
deno task calls:scheduler
```

### Updating webhook URLs

When your public URL changes (e.g. new ngrok session), update `APP_BASE_URL` in `.env` and run:

```bash
deno task calls:update-url
```

### Web calls

Open `/calls` in the browser to make voice calls directly from the UI via WebRTC — no phone number needed.

---

## Event Notifications

Calendar events with a time set automatically get notifications:

- **Telegram message** — sent ~10 minutes before the event via the bot
- **Phone call** (optional) — triggered ~5 minutes before if "Call me" was checked when creating the event

### Setup

#### 1. Telegram notifications (required)

Needs `TELEGRAM_BOT_TOKEN` and `BOT_HOST_ID` in `.env` (same as the bot).

#### 2. Phone call notifications (optional)

Needs Retell AI configured (see Voice Calling above) plus:

```env
RETELL_AGENT_ID=<your agent ID>
RETELL_FROM_NUMBER=+1XXXXXXXXXX
REMINDER_TO_NUMBER=+1YYYYYYYYYY
```

#### 3. Run the event scheduler

```bash
deno task events:scheduler
```

In Docker, the `event-scheduler` service starts automatically alongside the bot.

### How it works

- The scheduler polls every 60 seconds for events approaching their `event_time`
- Events within 10 minutes get a Telegram notification (once per event)
- Events within 5 minutes with `notify_call = 1` get a phone call (once per event)
- Notification flags (`notified_telegram`, `notified_call`) prevent duplicate sends

---

## REST API

### Projects

```
GET    /api/projects          → list all projects
POST   /api/projects          → create project  { name, description? }
GET    /api/projects/:id      → get project + tasks
PUT    /api/projects/:id      → update project  { name?, description? }
DELETE /api/projects/:id      → delete project
```

### Tasks

```
GET    /api/tasks             → list tasks  ?project_id=&status=&priority=
POST   /api/tasks             → create task  { project_id, title, description?, priority?, status? }
GET    /api/tasks/:id         → get task + attachments
PUT    /api/tasks/:id         → update task  { title?, description?, priority?, status? }
DELETE /api/tasks/:id         → delete task
```

### Calendar Events

```
GET    /api/events            → list events  ?month=YYYY-MM&project_id=
POST   /api/events            → create event  { title, event_date, description?, event_time?, type?, project_id?, notify_call? }
GET    /api/events/:id        → get event
PUT    /api/events/:id        → update event  { title?, description?, event_date?, event_time?, type?, project_id?, notify_call? }
DELETE /api/events/:id        → delete event
```

Event types: `event`, `note`, `reminder`.

`notify_call` (boolean) — when `true` and `event_time` is set, the event scheduler will trigger a phone call 5 minutes before the event. Timed events always get a Telegram notification 10 minutes before, regardless of this flag.

### Attachments

```
POST   /api/tasks/:id/upload  → upload file (multipart, field: "file")
                                 image/*        → type "image"
                                 audio/webm|ogg → type "voice" (recorded memo)
                                 other audio/*  → type "audio" (MP3, M4A, etc.)
                                 video/*        → type "video" (MP4, MOV, etc.)
GET    /api/uploads/:filename → serve uploaded file
```

### Voice

```
POST   /api/voice/tool       → Retell function-calling dispatcher (called by Retell AI)
POST   /api/voice/web-call   → create web call { } → { access_token, call_id }
POST   /api/voice/webhook    → Retell event webhook (call_started, call_ended, call_analyzed)
```

### Reminders

```
GET    /api/reminders         → list reminders  ?status=
POST   /api/reminders         → create reminder  { message, remind_at, phone_number?, task_id?, project_id? }
GET    /api/reminders/:id     → get reminder
PUT    /api/reminders/:id     → update reminder  { message?, remind_at?, phone_number?, status? }
DELETE /api/reminders/:id     → delete reminder
```

---

## Project structure

```
task-light/
├── bot/
│   ├── main.ts            # Telegram bot entry point (grammY)
│   ├── agent.ts           # AI agent loop (Anthropic / OpenAI) + voice transcription
│   ├── tools.ts           # Tool definitions and REST API executor
│   ├── media.ts           # Telegram file download helpers
│   └── store.ts           # SQLite store for group/channel message history (data/bot-messages.db)
├── calls/
│   ├── retell.ts          # Retell AI API client (fetch-based)
│   ├── tools.ts           # Voice agent tool definitions for Retell LLM
│   ├── setup.ts           # One-time setup: creates Retell LLM + Agent
│   ├── update-url.ts      # Update webhook URLs after ngrok restart
│   ├── scheduler.ts       # Reminder scheduler — triggers outbound calls
│   └── event-scheduler.ts # Event notification scheduler (Telegram + phone calls)
├── db/
│   ├── database.ts        # DB adapter — local SQLite (node:sqlite) or Turso (@libsql/client)
│   └── queries.ts         # Async CRUD helpers (work with both adapters)
├── mcp/
│   ├── server.ts          # MCP stdio server — direct SQLite access
│   └── http-client.ts     # MCP stdio server — HTTP client (compilable)
├── routes/
│   ├── _app.tsx           # Global layout
│   ├── index.tsx          # → redirect to /projects
│   ├── calendar.tsx       # Calendar page (FullCalendar, events/notes/reminders)
│   ├── calls.tsx          # Voice agent page (web call, reminders, call history)
│   ├── projects/
│   │   ├── index.tsx      # Project list
│   │   └── [id]/
│   │       ├── index.tsx  # Project detail (list + board view, view toggle)
│   │       └── tasks/
│   │           ├── new.tsx
│   │           └── [taskId]/
│   │               ├── index.tsx  # Task detail (attachments, status update)
│   │               └── edit.tsx
│   ├── mcp.ts             # MCP Streamable HTTP endpoint (/mcp)
│   └── api/
│       ├── projects/
│       ├── tasks/
│       │   └── [id]/upload.tsx
│       ├── uploads/
│       ├── events/         # Calendar event CRUD
│       ├── voice/          # Retell AI webhooks
│       │   ├── tool.ts     # Function-calling dispatcher
│       │   ├── web-call.ts # Create web call (returns access token)
│       │   └── webhook.ts  # Call lifecycle events
│       └── reminders/      # Reminder CRUD
├── islands/               # Client-side Preact components (hydrated in browser)
│   ├── ProjectCreateModal.tsx
│   ├── KanbanBoard.tsx        # Drag-and-drop board view
│   ├── ImageLightbox.tsx      # Full-screen image viewer
│   ├── AttachmentUploader.tsx # Drag-drop file uploader (image / audio / video)
│   ├── Calendar.tsx            # Interactive calendar (FullCalendar)
│   ├── VoiceRecorder.tsx      # In-browser voice memo recorder
│   └── WebCall.tsx            # WebRTC voice call with live transcript
├── components/
│   └── Badge.tsx
├── data/                  # Runtime data (gitignored) — DB files + uploads
│   ├── task-light.db      # Main app SQLite database (local mode)
│   ├── bot-messages.db    # Telegram message history
│   └── uploads/           # Uploaded files
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── deno.json
```

---

## Stack


| Layer         | Technology                                                   |
| ------------- | ------------------------------------------------------------ |
| Runtime       | Deno 2.2+                                                    |
| Framework     | Fresh 2.2                                                    |
| Bundler       | Vite 7 + `@fresh/plugin-vite`                                |
| Styling       | Tailwind CSS v4                                              |
| Database      | SQLite via `node:sqlite` (local) or Turso (`@libsql/client`) |
| Interactivity | Preact islands + `@preact/signals`                           |
| MCP           | `@modelcontextprotocol/sdk`                                  |
| Telegram bot  | grammY                                                       |
| AI agent      | Anthropic SDK / OpenAI SDK                                   |
| Voice calling | Retell AI + `retell-client-js-sdk` (WebRTC)                  |


---

## Deno tasks


| Task                       | What it does                                         |
| -------------------------- | ---------------------------------------------------- |
| `deno task dev`            | Dev server with HMR on port 8011                     |
| `deno task build`          | Build for production → `_fresh/`                     |
| `deno task start`          | Serve production build on port 8011                  |
| `deno task preview`        | Build + serve in one command (useful in Arc browser) |
| `deno task bot`            | Run the Telegram bot (reads `.env`)                  |
| `deno task mcp`            | MCP server — direct SQLite access                    |
| `deno task mcp:http`       | MCP server — HTTP client mode                        |
| `deno task compile-mcp`    | Compile MCP HTTP client to a standalone binary       |
| `deno task calls:setup`    | Create Retell AI voice agent (one-time setup)        |
| `deno task calls:update-url` | Update Retell webhook URLs after ngrok restart     |
| `deno task calls:scheduler` | Run reminder scheduler for outbound calls          |
| `deno task events:scheduler` | Run event notification scheduler (Telegram + calls) |


---

## Data

All runtime data lives under `data/` (relative to the working directory):


| Path                   | Contents                                              |
| ---------------------- | ----------------------------------------------------- |
| `data/task-light.db`   | Main app database (local SQLite mode only)            |
| `data/bot-messages.db` | Telegram group/channel message history (always local) |
| `data/uploads/`        | Uploaded files (images, audio, video)                 |


All files are created automatically on first run. In Docker, the entire `data/` directory is bind-mounted from the host (`./data:/app/data`), so data survives container restarts and image rebuilds.

When Turso is configured, `data/task-light.db` is never written — but `data/uploads/` is still used for file storage.