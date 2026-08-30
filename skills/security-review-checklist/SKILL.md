---
name: security-review-checklist
description: Security review checklist for subagents — concrete vulnerability classes, severity scoring, and a fixed report format.
---

# Security review checklist

Review the given code/diff for concrete, demonstrable security issues. You
are looking for real vulnerabilities, not style warnings.

## Checklist (in order of likely impact)

1. **Secrets** — API keys, tokens, passwords, private keys hardcoded or
   logged. Grep for likely patterns (key=, token, secret, BEGIN PRIVATE).
2. **Injection** — user input reaching SQL, shell commands, HTML, paths,
   or eval-family sinks without validation/parameterization.
3. **Authentication/authorization** — endpoints or functions reachable
   without an auth check; IDOR (one user reading another's id); missing
   server-side validation on client-declared values.
4. **Cryptography** — Math.random() for tokens/ids, MD5/SHA1 for
   passwords, non-constant-time comparison of secrets, weak KDF
   iterations.
5. **Transport** — cleartext http:// for non-asset traffic, TLS
   verification disabled.
6. **Data exposure** — sensitive data in logs, error messages, analytics,
   or client-visible payloads.

## Rules

- Only report issues in the code you were given. For each, show the exact
  `file:line` and quote the offending line.
- Explain the attack in one sentence an engineer can act on: who can do
  what, and what it costs them.
- Do not report theoretical issues with no reachable path ("someone might
  someday..."). If a control already mitigates it, say the issue is
  mitigated and move on.

## Severity scale

- `critical` — exploitable now, secret leak, auth bypass.
- `high` — exploitable with a plausible attacker.
- `medium` — weak control, defense-in-depth gap.
- `low` — hardening opportunity.

## Output format

1. **Scope** — one line: what you reviewed.
2. **Findings** — most severe first: `SEVERITY — file:line —
  vulnerability — attack in one sentence — smallest fix`.
3. **Clean areas** — checklist items you checked and found clean.
4. **Not reviewed** — what was out of scope or unverifiable.
