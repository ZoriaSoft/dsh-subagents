# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-08-29

### Added
- CLI-backed roles now deliver the definition body as a system prompt where
  the CLI supports it (`pi`, `claude` via `--append-system-prompt`); CLIs
  without a system-prompt flag (`cmdc`, `agy`) embed the role instructions
  into the task; `dsh` headless documents the limitation.
- `/agents` slash command listing configured roles and diagnostics.
- Concurrency cap for CLI-backed executions (`maxConcurrentCli`, default 3).
- GitHub Actions CI (Node 20/22: syntax check + unit tests).
- `lib/reconcile.js` — the registration reconciliation extracted as pure,
  unit-tested logic.

### Changed
- Frontmatter parser supports YAML block scalars (`|`, `>` with `-`/`+`
  chomping) on top of scalars, quoted values, inline and block lists.
- README: architecture-decisions section (registration anchoring), CLI
  persona-delivery table.

## [0.1.0] — 2026-08-29

### Added
- Initial release: ZCode-style custom subagents for DeepSeek Harness.
- Roles as frontmatter+prompt Markdown under `$DSH_HOME/agents`; each becomes
  an `agent_<name>` tool picked by description.
- Model-backed roles with pinned `provider/model` routes (foreground
  parallel or background continuable) and tool allow/deny lists.
- CLI-backed roles (`cmdc | pi | agy | claude | dsh`) in shell-less
  subprocesses.
- Hot reload of definition edits, debug/ops route, unit tests and smoke
  script. Verified against dsh `0.1.1-rc.2`.
