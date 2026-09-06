import { App, staticFiles } from "fresh";
import { type State } from "./utils.ts";
import { listProjects } from "./db/queries.ts";

export const app = new App<State>();

app.use(staticFiles());

/**
 * Shared secret guarding the agent-facing routes.
 *
 * These are the routes a public deployment has to expose without the reverse
 * proxy's own authentication in front of them, because a voice agent calls them
 * directly and cannot pass through a browser login:
 *
 *   /api/voice/*  the agent's HTTP tools and its call webhook
 *   /mcp          the MCP endpoint, when the agent connects as an MCP client
 *
 * Everything else is expected to sit behind proxy auth — see README →
 * Deploying to a VPS.
 *
 * Left unset the routes stay open, which is fine for a laptop or a private
 * network and is why existing local setups keep working; on a public host set
 * it and hand the same value to the agent (`deno task calls:tools` prints the
 * exact header).
 */
const VOICE_API_TOKEN = Deno.env.get("VOICE_API_TOKEN");

/** Routes reached by the agent itself rather than by a logged-in browser. */
function isAgentRoute(pathname: string): boolean {
  return pathname.startsWith("/api/voice/") ||
    pathname === "/mcp" || pathname.startsWith("/mcp/");
}

if (!VOICE_API_TOKEN) {
  console.warn(
    "[auth] VOICE_API_TOKEN is not set — /api/voice/* and /mcp are open to anyone who can reach this server.",
  );
}

/** Constant-time string comparison, so a wrong token leaks no timing signal. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The token may arrive as a bearer token, a custom header, or a query
 * parameter — whichever the agent platform supports. Headers are preferred; the
 * query form is the fallback for tool configurations that cannot set them, and
 * it leaks the secret into access logs.
 */
function agentRequestAuthorized(req: Request, url: URL): boolean {
  if (!VOICE_API_TOKEN) return true;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const candidates = [
    bearer,
    req.headers.get("x-lite-task-token"),
    url.searchParams.get("token"),
  ];

  return candidates.some((c) => c && secretsMatch(c, VOICE_API_TOKEN));
}

app.use(async (ctx) => {
  const { pathname } = ctx.url;

  if (isAgentRoute(pathname)) {
    if (!agentRequestAuthorized(ctx.req, ctx.url)) {
      console.warn(`[auth] Rejected unauthenticated ${pathname}`);
      return new Response(null, { status: 401 });
    }
  }

  // Inject the project list into every request's state so the nav
  // can render the project switcher without each page fetching it separately.
  // Skip for static assets and API routes to avoid unnecessary DB hits.
  if (!pathname.startsWith("/api/") && !pathname.startsWith("/_fresh/")) {
    ctx.state.projects = await listProjects();
  } else {
    ctx.state.projects = [];
  }
  return await ctx.next();
});

app.fsRoutes();
