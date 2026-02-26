import { page } from "fresh";
import { define } from "../../utils.ts";
import { createProject, listProjects, type Project } from "../../db/queries.ts";
import ProjectCreateModal from "../../islands/ProjectCreateModal.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const projects = await listProjects();
    return page({ projects });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const name = (form.get("name") as string | null)?.trim() ?? "";
    const description = (form.get("description") as string | null)?.trim() ?? "";

    if (!name) {
      return new Response(null, { status: 400 });
    }

    const id = await createProject(name, description);
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
      {/* Header */}
      <div class="flex items-center justify-between mb-8 gap-4">
        <div>
          <div class="t-breadcrumb mb-2" style="font-size:.82rem; letter-spacing:.18em;">
            <span style="color: var(--green-mute);">ROOT</span>
            <span style="color: var(--b1);">/</span>
            <span style="color: var(--green-dim);">PROJECTS</span>
          </div>
          <h1 class="t-h1">
            PROJECT_LIST
            <span class="t-cursor" />
          </h1>
          <p class="mt-1" style="font-size:.82rem; letter-spacing:.18em; color: var(--green-mute);">
            {projects.length} RECORD{projects.length !== 1 ? "S" : ""} FOUND
          </p>
        </div>
        <ProjectCreateModal />
      </div>

      {projects.length === 0
        ? (
          <div class="t-empty">
            <div class="t-empty-icon">◈</div>
            <p class="t-h2" style="color: var(--green-mute);">NO RECORDS</p>
            <p class="mt-2" style="font-size:.82rem; letter-spacing:.15em; color: var(--green-faint);">
              INITIALIZE FIRST PROJECT TO BEGIN
            </p>
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

const ProjectCard = ({ project }: { project: Project }) => (
  <a href={`/projects/${project.id}`} class="t-proj-card">
    <div class="flex items-start justify-between gap-2 mb-3">
      <h2 class="t-h2 truncate" style="font-size:1.35rem;">
        {project.name}
      </h2>
      <span class="t-badge t-badge-muted shrink-0" style="margin-top:3px;">
        {project.task_count ?? 0}
      </span>
    </div>
    {project.description && (
      <p class="line-clamp-2 mb-3" style="font-size:.82rem; color: var(--green-mute); line-height:1.5;">
        {project.description}
      </p>
    )}
    <p style="font-size:.72rem; letter-spacing:.15em; color: var(--green-faint); text-transform:uppercase;">
      {new Date(project.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}
    </p>
    <div
      class="absolute bottom-0 left-0 right-0 h-px"
      style="background: linear-gradient(to right, transparent, var(--b1), transparent); opacity:0; transition: opacity 150ms;"
    />
  </a>
);
