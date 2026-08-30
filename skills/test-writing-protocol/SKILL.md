---
name: test-writing-protocol
description: Test-writing protocol for subagents — match project style, cover failure paths, run tests honestly, report real outcomes.
---

# Test writing protocol

Write or extend unit tests for a clearly scoped change. You are given the
change and the module it affects.

## Procedure

1. Read the target module first, then the changed code. Understand the
   exact behavior you must test before writing anything.
2. Find an existing test file for that module. Copy its style exactly:
   framework, naming, AAA structure, assertion style. Do not import a
   different test runner.
3. Cover, in this priority:
   - the stated behavior (the happy path),
   - the explicit edge cases the task names,
   - failure paths (error thrown, invalid input, null/undefined),
   - one boundary condition (empty/zero/one/large).
4. Do not write cosmetic tests that always pass (e.g. "expect(true)").

## Running

- Run the tests you wrote or modified if a runner is available (`npm test`,
  `node --test`, `flutter test`, etc.). Use the command the project already
  uses.
- Report the REAL command and its REAL outcome (passed/failed, counts). Do
  not fabricate a pass.
- If no runner is available, say so plainly and leave the tests in place
  for the project's CI to run.

## Scope

- Tests only. No production-code edits. If the code under test has a bug
  that blocks the test, stop and report it — do not fix it here.

## Output format

1. **What I tested** — one line per behavior covered.
2. **Files** — the test files you changed or created.
3. **Run** — the command and its real outcome, or "no runner available".
