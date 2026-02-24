import { page } from "fresh";
import { define } from "../../utils.ts";
import { createProject, listProjects, type Project } from "../../db/queries.ts";
import ProjectCreateModal from "../../islands/ProjectCreateModal.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const projects = listProjects();
    return page({ projects });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = (form.get("name") as string | null)?.trim() ?? "";
    const description = (form.get("description") as string | null)?.trim() ?? "";

    if (!name) {
      return new Response(null, { status: 400 });
    }

    const id = createProject(name, description);
    return new Response(null, {
      status: 303,
      headers: { Location: `/projects/${id}` },
    });
  },
});

export default define.page<typeof handler>(function ProjectsPage({ data }) {
  const { projects } = data;

  return (
    <div>
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold text-white">Projects</h1>
          <p class="text-zinc-400 text-sm mt-1">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <ProjectCreateModal />
      </div>

      {projects.length === 0
        ? (
          <div class="text-center py-24 text-zinc-500">
            <div class="text-5xl mb-4">◆</div>
            <p class="text-lg font-medium text-zinc-400">No projects yet</p>
            <p class="text-sm mt-1">Create your first project to get started</p>
          </div>
        )
        : (
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => <ProjectCard project={p} key={p.id} />)}
          </div>
        )}
    </div>
  );
});

function ProjectCard({ project }: { project: Project }) {
  return (
    <a
      href={`/projects/${project.id}`}
      class="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-violet-500/50 hover:bg-zinc-800/60 transition-all group"
    >
      <div class="flex items-start justify-between gap-2 mb-3">
        <h2 class="font-semibold text-white group-hover:text-violet-300 transition-colors truncate">
          {project.name}
        </h2>
        <span class="text-xs text-zinc-500 shrink-0 mt-0.5">
          {project.task_count ?? 0} task{(project.task_count ?? 0) !== 1 ? "s" : ""}
        </span>
      </div>
      {project.description && (
        <p class="text-sm text-zinc-400 line-clamp-2 mb-3">
          {project.description}
        </p>
      )}
      <p class="text-xs text-zinc-600">
        {new Date(project.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
    </a>
  );
}
