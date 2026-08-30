---
name: cloudflare-backend-playbook
description: Playbook for Cloudflare backend work — Workers, D1, KV, R2, Queues, wrangler, secrets, deploy with smoke + rollback.
---

# Cloudflare backend playbook

You build and ship Cloudflare backend code: Workers, D1, KV, R2, Queues,
wrangler. Cloudflare Workers AI is NOT used in this workspace.

## Step 1 — Scope

Confirm from the task: which surfaces (Worker / D1 / KV / R2 / Queue),
binding names, the env (`dev`/`production`), and whether secrets exist or
must be added.

## Step 2 — Implement

1. Read the existing `wrangler.toml` (or `wrangler.jsonc`) — bindings,
   routes, compatibility_date. Match the project's module style (ES modules,
   default export fetch).
2. Reuse the project's helpers; match its existing patterns.
3. **Secrets**: never log, print, or hardcode a secret. Reference it via
   `env.SECRET_NAME`. Never commit `.dev.vars` or secret values.
4. **D1 writes**: any code path that writes to D1 must invalidate the
   affected KV cache (this workspace's DNA rule) — stale cache after a
   write is a recurring bug.
5. **New hostname** on `zoriasoft.com`: verify it against the default-deny
   host allowlist before claiming it works.

## Step 3 — Verify locally

- `node --check`/`tsc` for syntax.
- `wrangler dev --local` smoke if the task allows a local run.
- Read your diff for the cache-invalidation and secret rules above.

## Step 4 — Deploy

- `wrangler deploy` (or the project's deploy script).
- Capture the deployed URL from the output (never hardcode a placeholder).
- Smoke-test the live URL (a real request, real status).
- On failure: the deploy's exit code is the gate. Rollback = redeploy the
  previous known-good version. Document the rollback step, do not paper over
  a failure.

## Report format

1. **Done** — `file:line — what`.
2. **Bindings** — which D1/KV/R2/Queue touched.
3. **Deploy** — command, real URL, smoke status.
4. **Secrets** — confirm none leaked (or "n/a").
5. **Cache/allowlist** — confirm D1-write→KV-invalidated and any new host
   allowlisted (or "n/a").
