# dsh-subagents — Memory

> Tek doğruluk kaynağı. Her sprint sonunda güncellenir.

## Ne
ZCode tarzı özel subagent'lar (DeepSeek Harness / dsh). Roller Markdown dosyası olarak tanımlanır; birincil model bunlara per-rol tool olarak delege eder — pinned dsh model route üzerinden veya harici CLI ile (agy, vibe, devin). `bin/dsh-roles.mjs` herhangi bir CLI-backed rolü diğer harness'lerde headless çalıştırır.

## Stack
- Node (package `dsh-subagents` v0.10.0) · CI badge: `ZoriaSoft/dsh-subagents`

## Notlar
- Tool filtreleri (`tools:` / `disallowedTools:`) caller agent scope'u ile
  sanitize edilir (`sanitizeToolFilter(ctx, def, exec.agent)`) — native tool'lar
  agent-scoped'tır, global `view(undefined)` native adları bilmez (dsh 0.1.5-rc.1).
- ZCode köprüsü: dsh dışı harness'lerde `node bin/dsh-roles.mjs run <rol> "<görev>" --cwd <dizin>`.
- Kurallar kanonik: `zoria-dsh-roles` skill'i. Bu MEMORY.md otomatik şablondan.
