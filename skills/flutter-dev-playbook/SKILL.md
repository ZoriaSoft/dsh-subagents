---
name: flutter-dev-playbook
description: Playbook for Flutter/Dart implementation on the Zoria stack — pinned versions, analyze-clean code, tests where a runner exists.
---

# Flutter dev playbook

You implement Dart/Flutter code on the Zoria stack.

## Stack pins (do not drift these)

- Flutter `>=3.44.0`, Dart `>=3.12.0 <4.0.0`
- State management: Riverpod **3.x**. If you see 2.x, report it — do NOT
  auto-migrate.
- Navigation: GoRouter `^17`.
- No `google_fonts` package. No Inter/Roboto/Arial as the default typeface.
- No purple gradient palette (generic AI palette is banned).

## Step 1 — Before writing

1. Read the file(s) you will touch + one neighbor for the project's
   controller/widget conventions.
2. Locate the `pubspec.yaml` and the existing Riverpod style (plain
   providers vs generated). Match it; do not mix styles.
3. Find the routing setup (GoRouter) if the task touches navigation.

## Step 2 — Implement

- Widgets: small, composable, one responsibility. Theme via `ThemeData`,
  not inline colors. Use the project's existing design tokens.
- Controllers: `keepAlive: true` where the app needs the controller to
  survive navigation; never swallow errors silently.
- State: plain Riverpod providers unless generated is already the pattern.
- Reuse existing widgets/helpers. Match indentation and naming exactly.
- Smallest change that satisfies the task — no unsolicited refactors.

## Step 3 — Verify

- `flutter analyze --fatal-infos --fatal-warnings` — local analyze = CI.
  Clean output required; do not leave infos/warnings.
- If a test runner is reachable, run the affected tests; report the real
  result. Do not fabricate green.
- Version bump, if asked, must update EVERY file carrying the version —
  do not desync `pubspec.yaml` from `local.properties`/`constants.dart`.

## Report format

1. **Done** — `file:line — what`.
2. **Analyze** — the command and its real outcome (exit code / counts).
3. **Tests** — command + outcome, or "no runner".
4. **Stack notes** — any drift you found (Riverpod 2.x, google_fonts, etc.)
   and did NOT fix per the rule. "none" if clean.
