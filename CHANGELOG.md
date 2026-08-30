# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-08-30

### Added
- ZCode-parity management UI: two-pane manager with the roles list and a
  New/Edit editor — name (live tool-name preview), color swatches, brain
  selector (session model / dsh model / CLI), provider-grouped model picker
  from the live catalog (156 models across 22 providers), tool allow-list
  chips, system prompt, live definition-file preview, delete with confirm.
- `POST /plugins/dsh-subagents/save` and `/delete` write/remove definition
  files (`serializeDefinition` round-trips with the parser, unit-tested);
  `GET /catalog` exposes providers, models and the supported CLIs;
  `/debug` now includes each role's color, description, body and the global
  available-tool list.

### Changed
- Panel redesign: settings-style rows with hover actions, refined spacing,
  focus states and a sticky editor action bar.

## [0.3.0] — 2026-08-30

### Added
- Web panel: sidebar launcher + full-screen overlay listing every role with
  its route badge (model / cli / session model), tool name, definition file
  and tool allow-lists; definition diagnostics at a glance.
- One-click test prompt copy per role and enable/disable toggling from the
  panel (`POST /plugins/dsh-subagents/toggle` renames the file with the `_`
  prefix; hot reload applies it to the next turn).
- Fetch-on-demand panel data (mount + toggle + Refresh button) — no
  long-lived timers.

### Fixed
- `/debug` disabled-role entries now carry `disabled: true` (and description
  / tool lists), so management surfaces render their state correctly.

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
