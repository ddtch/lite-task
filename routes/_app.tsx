import { define } from "../utils.ts";
import ProjectSwitcher from "../islands/ProjectSwitcher.tsx";

export default define.page(function App({ Component, url, state }) {
  // Extract current project id from URL (/projects/123/...)
  const match = url.pathname.match(/^\/projects\/(\d+)/);
  const currentProjectId = match ? Number(match[1]) : undefined;

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Lite Task</title>
        <link rel="icon" href="/favicon.ico?v=2" />
      </head>
      <body class="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col">
        <nav class="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
          <div class="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
            {/* Logo */}
            <a
              href="/projects"
              class="font-semibold text-white tracking-tight flex items-center gap-2 shrink-0"
            >
              <img src="/logo.svg" alt="Lite Task" class="w-6 h-6" />
              Lite Task
            </a>

            {/* Divider */}
            <span class="text-zinc-700 select-none">/</span>

            {/* Project switcher dropdown */}
            <ProjectSwitcher
              projects={state.projects ?? []}
              currentProjectId={currentProjectId}
            />
          </div>
        </nav>

        <main class="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
          <Component />
        </main>

        <footer class="border-t border-zinc-800 text-zinc-600 text-xs text-center py-4">
          Lite Task · local SQLite · Fresh 2.2
        </footer>
      </body>
    </html>
  );
});
