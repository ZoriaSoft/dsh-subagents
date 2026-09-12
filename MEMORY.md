# dsh-subagents — Memory

> Tek doğruluk kaynağı. Her sprint sonunda güncellenir.

## Ne
ZCode tarzı özel subagent'lar (DeepSeek Harness / dsh). Roller Markdown dosyası olarak tanımlanır; birincil model bunlara per-rol tool olarak delege eder — pinned dsh model route üzerinden veya harici CLI ile (cmdc, pi, agy, claude, dsh, vibe). `bin/dsh-roles.mjs` herhangi bir CLI-backed rolü diğer harness'lerde headless çalıştırır.

## Stack
- Node (package `dsh-subagents` v0.9.0) · CI badge: `ZoriaSoft/dsh-subagents`

## Notlar
- ZCode köprüsü: dsh dışı harness'lerde `node bin/dsh-roles.mjs run <rol> "<görev>" --cwd <dizin>`.
- Kurallar kanonik: `zoria-dsh-roles` skill'i. Bu MEMORY.md otomatik şablondan.
