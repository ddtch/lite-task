import { define } from "../utils.ts";
import ProjectSwitcher from "../islands/ProjectSwitcher.tsx";

export default define.page(function App({ Component, url, state }) {
  const match = url.pathname.match(/^\/projects\/(\d+)/);
  const currentProjectId = match ? Number(match[1]) : undefined;

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>LITE-TASK // TERMINAL</title>
        <link rel="icon" href="/favicon.ico?v=2" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body class="min-h-screen flex flex-col">
        <nav class="t-nav">
          <div class="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
            <a href="/projects" class="t-nav-logo shrink-0">
              <span style="color: var(--cyan);">[</span>
              LT
              <span style="color: var(--cyan);">]</span>
            </a>

            <span class="t-nav-sep select-none">/</span>

            <ProjectSwitcher
              projects={state.projects ?? []}
              currentProjectId={currentProjectId}
            />

            <a
              href="/calls"
              class="ml-auto text-xs font-mono hidden sm:flex items-center gap-2 hover:opacity-80 transition-opacity"
              style={`color: ${url.pathname === "/calls" ? "var(--cyan)" : "var(--green-faint)"}; letter-spacing: .14em;`}
            >
              ◉ VOICE
            </a>
          </div>
        </nav>

        <main class="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
          <Component />
        </main>

        <footer class="t-footer">
          LITE-TASK &nbsp;·&nbsp; LOCAL:SQLITE &nbsp;·&nbsp; FRESH 2.2 &nbsp;·&nbsp;
          <span style="color: var(--green-mute);">SYS_v0.1.0</span>
        </footer>
      </body>
    </html>
  );
});
