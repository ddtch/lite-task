# lite-task

A local-first task manager with **projects**, **tasks**, **attachments** (images, audio, video, voice memos), and a **Telegram AI bot** — built with Deno, Fresh 2, and SQLite.

Designed to also act as an **MCP server** so Claude (or Claude Desktop) can read and manage your tasks directly from conversations.

---

## Features

- **Projects** — organize work into projects
- **Tasks** — title, description, priority (`low` / `medium` / `high`), status (`todo` / `in_progress` / `done`)
- **Board & list views** — toggle between a kanban board (with drag & drop) and a grouped list view
- **Attachments** — drag & drop images, upload audio files (MP3, M4A), upload video files (MP4), or record voice memos per task
- **Image lightbox** — click any image attachment to view it full-screen with prev/next navigation
- **Clickable links** — URLs in task descriptions are automatically rendered as links
- **SQLite** — everything stored locally, zero cloud dependencies
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

The SQLite database (`task-light.db`) and uploads (`data/uploads/`) are created automatically on first run.

> **Arc browser users:** the dev server uses a custom Vite protocol scheme that Arc blocks. Use `deno task preview` (production build) for full functionality, or open in Chrome/Firefox.

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

# Copy and fill in env vars (required for Telegram bot, optional otherwise)
cp .env.example .env

docker compose up -d
# → http://localhost:8011
```

Data persists in `./task-light.db` and `./data/uploads/` on the host.

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
  -v "$(pwd)/task-light.db:/app/task-light.db" \
  -v "$(pwd)/data/uploads:/app/data/uploads" \
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

lite-task ships **two MCP server modes**. Pick one based on your setup.

### Mode 1: HTTP client (recommended)

Connects to any running lite-task instance over HTTP. Works whether the app runs locally, in Docker, or on a remote server. Can be compiled to a **standalone binary** — no Deno required on the machine running the AI tool.

#### Step 1 — compile the binary (once)

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

Add to `~/.cursor/mcp.json` (create if it doesn't exist):

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

Or use Deno:

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

### Mode 2: Direct DB access (local only)

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

> The `cwd` must point to `task-light/` so the server finds `task-light.db`.

---

### Available MCP tools

| Tool             | Description                                                |
| ---------------- | ---------------------------------------------------------- |
| `list_projects`  | List all projects with task counts                         |
| `create_project` | Create a new project                                       |
| `get_project`    | Get a project with its tasks                               |
| `delete_project` | Delete a project and all its tasks                         |
| `list_tasks`     | List tasks — filter by `project_id`, `status`, `priority` |
| `create_task`    | Create a task in a project                                 |
| `get_task`       | Get task details including attachments                     |
| `update_task`    | Update title, description, status, or priority             |
| `delete_task`    | Delete a task                                              |
| `get_attachment` | Download an attachment image and return it as base64       |

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

The `bot` service starts automatically after the `lite-task` service passes its health check.

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

| Telegram type   | Stored as  |
| --------------- | ---------- |
| Photo           | `image`    |
| Voice message   | `voice`    |
| Audio (MP3/M4A) | `audio`    |
| Video (MP4)     | `video`    |
| Document/file   | auto-detected by MIME type |

### Groups and channels

Add the bot to a Telegram group or channel. It saves all messages it sees to a local SQLite store (`bot-messages.db`). From your private chat with the bot, you can ask it to read group history:

- "What was discussed in the team group today?"
- "Create tasks from the last 20 messages in the project channel"

In groups, the bot only responds when @mentioned or when replying to its own message.

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

### Attachments

```
POST   /api/tasks/:id/upload  → upload file (multipart, field: "file")
                                 image/*        → type "image"
                                 audio/webm|ogg → type "voice" (recorded memo)
                                 other audio/*  → type "audio" (MP3, M4A, etc.)
                                 video/*        → type "video" (MP4, MOV, etc.)
GET    /api/uploads/:filename → serve uploaded file
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
│   └── store.ts           # SQLite store for group/channel message history
├── db/
│   ├── database.ts        # SQLite connection (node:sqlite built-in)
│   └── queries.ts         # CRUD helpers
├── mcp/
│   ├── server.ts          # MCP stdio server — direct SQLite access
│   └── http-client.ts     # MCP stdio server — HTTP client (compilable)
├── routes/
│   ├── _app.tsx           # Global layout
│   ├── index.tsx          # → redirect to /projects
│   ├── projects/
│   │   ├── index.tsx      # Project list
│   │   └── [id]/
│   │       ├── index.tsx  # Project detail (list + board view, view toggle)
│   │       └── tasks/
│   │           ├── new.tsx
│   │           └── [taskId]/
│   │               ├── index.tsx  # Task detail (attachments, status update)
│   │               └── edit.tsx
│   └── api/
│       ├── projects/
│       ├── tasks/
│       │   └── [id]/upload.tsx
│       └── uploads/
├── islands/               # Client-side Preact components (hydrated in browser)
│   ├── ProjectCreateModal.tsx
│   ├── KanbanBoard.tsx        # Drag-and-drop board view
│   ├── ImageLightbox.tsx      # Full-screen image viewer
│   ├── AttachmentUploader.tsx # Drag-drop file uploader (image / audio / video)
│   └── VoiceRecorder.tsx      # In-browser voice memo recorder
├── components/
│   └── Badge.tsx
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── deno.json
```

---

## Stack

| Layer         | Technology                               |
| ------------- | ---------------------------------------- |
| Runtime       | Deno 2.2+                                |
| Framework     | Fresh 2.2                                |
| Bundler       | Vite 7 + `@fresh/plugin-vite`            |
| Styling       | Tailwind CSS v4                          |
| Database      | SQLite via `node:sqlite` (Deno built-in) |
| Interactivity | Preact islands + `@preact/signals`       |
| MCP           | `@modelcontextprotocol/sdk`              |
| Telegram bot  | grammY                                   |
| AI agent      | Anthropic SDK / OpenAI SDK               |

---

## Deno tasks

| Task                    | What it does                                         |
| ----------------------- | ---------------------------------------------------- |
| `deno task dev`         | Dev server with HMR on port 8011                     |
| `deno task build`       | Build for production → `_fresh/`                     |
| `deno task start`       | Serve production build on port 8011                  |
| `deno task preview`     | Build + serve in one command (useful in Arc browser) |
| `deno task bot`         | Run the Telegram bot (reads `.env`)                  |
| `deno task mcp`         | MCP server — direct SQLite access                    |
| `deno task mcp:http`    | MCP server — HTTP client mode                        |
| `deno task compile-mcp` | Compile MCP HTTP client to a standalone binary       |

---

## Data

- **Database**: `task-light.db` — created automatically in the working directory
- **Uploads**: `data/uploads/` — created automatically
- **Bot message store**: `bot-messages.db` — created automatically when the bot runs
- All paths are relative to the process working directory, making them easy to mount as Docker volumes
