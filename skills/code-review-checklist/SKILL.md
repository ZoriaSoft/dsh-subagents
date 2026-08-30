---
name: code-review-checklist
description: Structured code-review checklist with severity ranking and a fixed report format, tuned for routine reviews by small models.
---

# Code review checklist

Review the change you were given. If you were given a diff, read it line by
line. If you were given files, read the parts the task names. Work through
the checklist in order — do not jump to conclusions before reading.

## Checklist

1. **Correctness** — does the code do what it claims? Off-by-one, inverted
   conditions, wrong variable, missing null/undefined handling, broken
   error paths, race conditions in async code.
2. **Edge cases** — empty input, zero, one, many, very large, unicode,
   concurrent calls, retry after failure.
3. **Security** — injection (SQL/command/path), secrets in code or logs,
   missing authorization checks, unvalidated external input.
4. **Performance** — loops that re-read files or re-query per item,
   unbounded memory, obvious N+1 patterns.
5. **Missing tests** — which changed behavior has no test covering it?
6. **Consistency** — does the change follow the file's existing style and
   the project's conventions?

## Rules

- Only report issues you can point to in the code. Quote the exact spot as
  `file:line`.
- Do not invent issues to look thorough. If the change is clean, say so.
- Do not praise the code. No compliment sentences, ever.

## Output format

1. **Summary** — one sentence: what the change does.
2. **Findings** — a table or list, most severe first. Each finding:
   `SEVERITY (critical|high|medium|low) — file:line — what is wrong — why
   it matters — smallest reasonable fix`.
3. **Not covered** — what you could not verify (unrelated files, runtime
   behavior, tests you could not run). Write "none" if fully covered.
