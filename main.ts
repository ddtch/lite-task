import { App, staticFiles } from "fresh";
import { type State } from "./utils.ts";
import { listProjects } from "./db/queries.ts";

export const app = new App<State>();

app.use(staticFiles());

// Inject the project list into every request's state so the nav
// can render the project switcher without each page fetching it separately.
app.use(async (ctx) => {
  // Skip for static assets and API routes to avoid unnecessary DB hits
  const { pathname } = ctx.url;
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/_fresh/")) {
    ctx.state.projects = listProjects();
  } else {
    ctx.state.projects = [];
  }
  return await ctx.next();
});

app.fsRoutes();
