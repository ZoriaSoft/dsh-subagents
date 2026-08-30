# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] — 2026-08-30

### Added
- Model selection for CLI-backed roles: `cliModel` pins the CLI's own model
  and is delivered through its `--model` flag (cmdc, pi, agy, claude; the dsh
  headless profile is model-bound and documented as unsupported). The manager
  editor shows a model input under the CLI picker, `/save` validates the
  combination and `/debug` round-trips it.

## [0.6.0] — 2026-08-30

### Changed (breaking — roster redesign)
- **Bundled roster replaced** with a nine-role master roster; the previous
  eight roles (researcher, reviewer, test-writer, implementer, debugger,
  doc-writer, translator and the CLI-backed example) are retired. Roles
  kept/renamed: `code-reviewer` (ex reviewer), `security-auditor`.
  New roles: `general-purpose` (inherit route, full toolkit),
  `explorer` (read-only codebase mapping), `aso-specialist` (evidence-backed
  ASO with `web_search`), `backend-cloudflare` (Workers/D1/KV/R2 + deploy
  discipline), `flutter-dev` (Zoria stack pins), `orchestrator` (planning
  conductor returning an executable assignment plan) and `ui-designer`
  (design spec / ThemeData / review under the Zoria visual DNA, with
  `modlens_read_image`).
- Skill routes tightened: planner/coder specialists (`orchestrator`,
  `aso-specialist`, `backend-cloudflare`, `flutter-dev`) run on
  `your-provider/strong-model`; scan/review roles stay on
  `bai/glm-5.3-flash`; `general-purpose` inherits the session model.
- Skill bundle reshaped to match: 6 single-role protocols retired; 7 new
  playbooks added (`general-purpose-playbook`, `codebase-exploration`,
  `aso-playbook`, `cloudflare-backend-playbook`, `flutter-dev-playbook`,
  `orchestration-playbook`, `ui-design-playbook`) alongside
  `subagent-ground-rules`, `code-review-checklist` and
  `security-review-checklist`.

### Added
- `test/roster.test.js` — roster integrity in CI: every example role parses
  clean, every role-referenced skill resolves under `skills/`, every bundled
  skill file parses with a non-empty body.

## [0.5.0] — 2026-08-30

### Added
- Role skills: definitions may name skills (`skills: [name, …]`), resolved at
  spawn time and inlined into the child persona — deterministic preload for
  cheap models, zero pollution of the calling session's skill catalog.
  Resolution: `skillsDirs` config (default `$DSH_HOME/subagent-skills`) wins
  over the plugin-bundled `skills/`; missing skills warn and spawn without.
- Curated bundled roster (8 roles) + 9 role skills: researcher, reviewer,
  test-writer, implementer, debugger, security-auditor, doc-writer and the
  CLI-backed translator — each with a scoped tool allow-list (including
  `skill`), severity-ranked output contracts, UNVERIFIED honesty rules and
  the shared `subagent-ground-rules` protocol for low-capability models.
- `scripts/install-roster.sh` — idempotent install of roles and skills into
  a DSH home.
- `/debug` now reports `skillsDirs` and per-role `skills`; the manager UI
  shows a skills count per role and a comma-separated skills field in the
  editor (round-trips through `/save` with kebab-case validation).

### Changed
- Hot-reload reconciliation now compares content signatures instead of object
  identity (`definitionSignature`): unchanged definitions are never pointlessly
  re-registered on rescans.
- `/debug` `availableTools` lists every registered tool (`knownNames`), not
  only the calling context's visible subset, and no longer hardcodes hiding
  `run_code`.
- `model: inherit` roles round-trip correctly through the manager UI: `/debug`
  emits an empty `route` for inherit (plus a human `routeLabel`), so editing
  an inherit role no longer posts the invalid literal route string.
- `parseRoute` keeps splitting `provider/model` on the FIRST slash — nested
  model ids (`your-provider/strong-model`) are the verified catalog shape.

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
