# lite-task

A local-first task manager with **projects**, **tasks**, **image attachments**, and **voice memos** — built with Deno, Fresh 2, and SQLite.

Designed to also act as an **MCP server** so Claude (or Claude Desktop) can read and manage your tasks directly from conversations.

---

## Features

- **Projects** — organize work into projects
- **Tasks** — title, description, priority (`low` / `medium` / `high`), status (`todo` / `in_progress` / `done`)
- **Attachments** — drag & drop images or record voice memos per task
- **SQLite** — everything stored locally, zero cloud dependencies
- **REST API** — clean JSON API for programmatic access
- **MCP server** — two modes: direct DB (local) or HTTP client (remote/Docker)

---

## Quick start (local)

Requires [Deno 2.2+](https://docs.deno.com/runtime/getting_started/installation/).

```bash
git clone https://github.com/your-org/lite-task
cd lite-task/task-light

deno task dev
# → http://localhost:5173
```

The SQLite database (`task-light.db`) and uploads (`data/uploads/`) are created automatically on first run.

---

## Running in production (without Docker)

```bash
# 1. Install dependencies
deno install --allow-scripts=npm:@tailwindcss/oxide,npm:esbuild,npm:sharp

# 2. Build the Fresh app
deno task build

# 3. Serve
deno task start
# → http://localhost:8000
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

docker compose up -d
# → http://localhost:8000
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
  -p 8000:8000 \
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
# or add to PATH however you prefer
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
        "LITE_TASK_URL": "http://localhost:8000"
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
        "LITE_TASK_URL": "http://localhost:8000"
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
        "LITE_TASK_URL": "http://localhost:8000"
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
        "LITE_TASK_URL": "http://localhost:8000"
      }
    }
  }
}
```

Reload Cursor after saving. The tools are available to the Agent in Composer.

---

### Configure Claude Code (CLI)

Add to `~/.claude/settings.json` (create if it doesn't exist):

```json
{
  "mcpServers": {
    "lite-task": {
      "command": "/Users/you/.local/bin/lite-task-mcp",
      "env": {
        "LITE_TASK_URL": "http://localhost:8000"
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
        "LITE_TASK_URL": "http://localhost:8000"
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

> The `cwd` (working directory) must point to `task-light/` so the server finds `task-light.db`.

This config works in **Claude Desktop**, **Cursor**, and **Claude Code** — just drop it into the appropriate settings file from the sections above.

---

### Available MCP tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects with task counts |
| `create_project` | Create a new project |
| `get_project` | Get a project with its tasks |
| `delete_project` | Delete a project and all its tasks |
| `list_tasks` | List tasks — filter by `project_id`, `status`, `priority` |
| `create_task` | Create a task in a project |
| `get_task` | Get task details including attachments |
| `update_task` | Update title, description, status, or priority |
| `delete_task` | Delete a task |

---

## Publishing the MCP binary

The MCP HTTP client (`mcp/http-client.ts`) compiles to a standalone binary. The `.github/workflows/release.yml` workflow automates this: push a version tag and it cross-compiles for all five targets and creates a GitHub Release.

```bash
git tag v0.1.0
git push origin v0.1.0
# → GitHub Actions builds and publishes the release automatically
```

### npm

The `npm-package/` directory is a ready-to-publish npm package. It downloads the right platform binary on `postinstall`.

```bash
# 1. Update version in npm-package/package.json to match the git tag
# 2. Publish
cd npm-package
npm publish
```

Users install with:
```bash
npm install -g lite-task-mcp
# or
npx lite-task-mcp
```

### Homebrew

Homebrew requires a **tap** — a separate public GitHub repository named `homebrew-lite-task`.

```
# Repo structure: github.com/your-org/homebrew-lite-task
homebrew-lite-task/
└── Formula/
    └── lite-task-mcp.rb   ← copy from task-light/homebrew/lite-task-mcp.rb
```

After each release, update the `sha256` values in the formula using the `checksums.txt` file attached to the GitHub Release, then commit to the tap repo.

Users install with:
```bash
brew tap your-org/lite-task
brew install lite-task-mcp
```

### Shell script (universal)

`install.sh` works on any Linux or macOS machine with `curl`:

```bash
# Latest release
curl -fsSL https://raw.githubusercontent.com/your-org/lite-task/main/task-light/install.sh | sh

# Specific version or custom install dir
VERSION=0.2.0 INSTALL_DIR=~/.local/bin sh <(curl -fsSL .../install.sh)
```

---

## REST API

The web app exposes a JSON API used by the MCP HTTP client and available for any integration.

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
POST   /api/tasks/:id/upload  → upload image or audio (multipart, field: "file")
GET    /api/uploads/:filename → serve uploaded file
```

---

## Project structure

```
task-light/
├── db/
│   ├── database.ts        # SQLite connection (node:sqlite built-in)
│   └── queries.ts         # CRUD helpers
├── mcp/
│   ├── server.ts          # MCP stdio server — direct SQLite access
│   └── http-client.ts     # MCP stdio server — HTTP client (compilable)
├── routes/
│   ├── _app.tsx           # Global layout
│   ├── index.tsx          # → redirect /projects
│   ├── projects/          # Project pages
│   │   ├── index.tsx
│   │   └── [id]/
│   │       ├── index.tsx
│   │       └── tasks/
│   │           ├── new.tsx
│   │           └── [taskId]/
│   │               ├── index.tsx
│   │               └── edit.tsx
│   └── api/               # JSON API
│       ├── projects/
│       ├── tasks/
│       └── uploads/
├── islands/               # Client-side Preact components
│   ├── ProjectCreateModal.tsx
│   ├── AttachmentUploader.tsx
│   └── VoiceRecorder.tsx
├── components/
│   └── Badge.tsx
├── Dockerfile
├── docker-compose.yml
└── deno.json
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Deno 2.2+ |
| Framework | Fresh 2.2 |
| Bundler | Vite 7 + `@fresh/plugin-vite` |
| Styling | Tailwind CSS v4 |
| Database | SQLite via `node:sqlite` (Deno built-in) |
| Interactivity | Preact islands + `@preact/signals` |
| MCP | `@modelcontextprotocol/sdk` |

---

## Deno tasks

| Task | Command | What it does |
|------|---------|-------------|
| `deno task dev` | `vite` | Dev server with HMR |
| `deno task build` | `vite build` | Build for production → `_fresh/` |
| `deno task start` | `deno serve -A _fresh/server.js` | Serve production build |
| `deno task mcp` | `deno run -A mcp/server.ts` | MCP server (direct DB) |
| `deno task mcp:http` | `deno run -A mcp/http-client.ts` | MCP server (HTTP client) |
| `deno task compile-mcp` | `deno compile -A ...` | Compile MCP HTTP client to binary |

---

## Data

- **Database**: `task-light.db` — created automatically in the working directory
- **Uploads**: `data/uploads/` — created automatically
- Both paths are relative to the process working directory, making them easy to mount as Docker volumes
