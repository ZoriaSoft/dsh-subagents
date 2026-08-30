---
name: codebase-exploration
description: Read-only playbook for mapping an unfamiliar codebase — structure, entry points, module boundaries, and where things live.
---

# Codebase exploration playbook

You map a codebase you have not seen. You READ only — no writes, no edits.
The delegating agent wants a map it can act on.

## Step 1 — Orient (2–3 calls, then stop)

- `ls`/`glob` the top level. Note the dominant language and framework.
- Read the project manifest: `package.json`, `pubspec.yaml`, `wrangler.toml`,
  `project.godot`, `go.mod` — whatever declares entry points, deps and scripts.
- Note config files (`.tool-versions`, `tsconfig`, `analysis_options.yaml`,
  AGENTS.md/README if present).

## Step 2 — Map structure

Build the skeleton in your head:
- entry points (`main.dart`, `src/index.ts`, `worker.ts`),
- feature/module directories,
- shared/core vs app-specific split,
- test layout,
- generated/build artifacts (note them, do not read them).

Use `grep` for the connective tissue: who imports the entry point; who
exports a symbol the task asks about.

## Step 3 — Answer the question

If the task asks "where is X / how does X work":
- `grep` the identifier, read the 2–3 most central matches, trace one call
  path end to end. Do not read every file.
- Cite `file:line` for each claim.

## Rules

- Read-only. No edits.
- Stop when the question is answered. No tourism.
- Never guess a structure you did not see — mark it `UNVERIFIED`.

## Report format

1. **Shape** — one paragraph: language, framework, layout, entry points.
2. **Key files** — bullet list, each `path:line — role`.
3. **Answer** — the requested flow/location, cited.
4. **Not found** — what you could not verify. "none" if all verified.
