# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# Installs all deps (including Vite/Tailwind build tools) and compiles
# the Fresh app into _fresh/
# ─────────────────────────────────────────────────────────────────────────────
FROM denoland/deno:latest AS builder

WORKDIR /app

ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1

# Copy dependency manifests first so Docker can cache the install layer
COPY deno.json deno.lock ./

# Install all dependencies (npm postinstall scripts needed for esbuild/tailwind)
RUN deno install --allow-scripts=npm:@tailwindcss/oxide,npm:esbuild,npm:sharp

# Copy source
COPY . .

# Build Fresh app → produces _fresh/
RUN deno task build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime
# Lean image with only what's needed to serve the built app
# ─────────────────────────────────────────────────────────────────────────────
FROM denoland/deno:latest

WORKDIR /app

ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1
ENV PORT=8000

# Copy built output
COPY --from=builder /app/_fresh ./_fresh
COPY --from=builder /app/static ./static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/deno.json ./deno.json
COPY --from=builder /app/deno.lock ./deno.lock

# Persistent data dirs (override with Docker volumes)
RUN mkdir -p data/uploads

EXPOSE 8000

# Health check — pings the projects API
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD deno eval "const r = await fetch('http://localhost:8011/api/projects'); if (!r.ok) Deno.exit(1);"

CMD ["deno", "serve", "-A", "--port=8000", "--host=0.0.0.0", "_fresh/server.js"]
