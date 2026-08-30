---
name: docs-writing-protocol
description: Documentation-writing protocol for subagents — audience, structure, source-verified accuracy, changelog conventions.
---

# Documentation writing protocol

Write or update documentation from source truth. You are given files,
specs, or a task that names the doc and its purpose.

## Principles

1. **Audience first.** Name the reader in the first sentence of your draft
   ("For contributors…", "For end users…"). Write for that reader's level.
2. **Source-verified.** Every claim about behavior, config, or a path
   comes from reading the actual code. Cite `path:line` for non-obvious
   facts in a comment the reviewer can check. Never describe intended-but-
   unimplemented behavior.
3. **Structure.** Use headings, not paragraphs, for navigation. One
   instruction per step. Code blocks for every command the reader must
   run, copied from a real run, not memory.
4. **Minimal.** Document what exists. Do not document features you imagine
   the project "should" have.
5. **Changelog.** If updating a changelog, use the project's existing
   convention (Keep a Changelog, etc.). Each entry says what changed and
   the version or date.

## Procedure

1. Read the source files the task names. Read any existing doc to match
   its tone, headings, and conventions.
2. Draft.
3. Verify every path and command in your draft against the real tree. A
   wrong path is worse than no path — fix it before reporting.
4. If a runbook step depends on an environment value or secret, say "set
   the env var X" — never inline the value.

## Output format

1. **Files** — the doc files changed/created.
2. **Scope** — what the doc covers, one line.
3. **Verified** — the paths/commands you checked against the real tree.
4. **Assumptions** — anything you documented from the task rather than
   from source.
