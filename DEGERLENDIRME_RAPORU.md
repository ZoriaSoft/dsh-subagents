# Değerlendirme Raporu — dsh-subagents

**Tarih:** 2026-09-21 · **Tür:** tam zoria-review (bağımsız reviewer)
**Kapsam:** `/home/workspace/Projects/dsh-subagents` — dsh web plugin + headless `dsh-roles` runner
**Görsel kanıt:** N/A

## Özet

| Kategori | Durum | Not |
|---|---|---|
| Yapı / Mimari | PASS | 8.5/10 — saf çekirdek/UI ayrımı, hot-reload reconciliation, canlı model kataloğu, anlamlı test disiplini |
| Güvenlik | NEEDS_WORK | 7/10 — shell-less spawn + input regex iyi; puanı düşüren: route auth belirsizliği + process-tree kill eksikliği |

**Verdict: Sağlam plugin; yayın öncesi iki doğrulama — dsh-web'in plugin-route auth sözleşmesi + timeout sonrası torun süreçler.**

## Bağımsız reviewer bulguları

### MEDIUM

- **[MED] Plugin route'larında auth kontrolü yok** (`lib/index.js`): `/save`, `/delete`, `/toggle`, `/debug`, `/catalog`, `/activity` güvenliği tamamen dsh-web'in plugin-route auth'ına emanet — framework garantisi statik doğrulanamadı. Açıksa: `/save` → keyfi `.md` rol dosyası (filename regex traversal'ı engelliyor) → sonraki turda `agent_*` tool → kalıcılık + prompt injection; `/debug` rol body'leri + mutlak path sızıntısı. → dsh-web auth'u doğrula; plugin'de kendi token/origin kontrolü.
- **[MED] Timeout yalnız doğrudan child'ı öldürüyor** (`lib/runner.js`): `detached:false`, process-group kill yok → CLI child'ın torun süreçleri timeout sonrası yetim çalışmaya devam edebilir. → POSIX `detached:true` + `kill(-pid)` veya Windows `taskkill /T`.

### LOW / INFO

- Kullanıcı skill dizini bundled'dan önce çözülüyor — `$DSH_HOME/subagent-skills/subagent-ground-rules.md` yazan herkes tüm rollerin sistem talimatını override eder (agentsDir'e yazan = tüm davranış → bilinçliyse dokümante et); `--cwd` keyfi `chdir` (çağırıcı zaten tam yetkili); CLI katalog 10dk cache + 20s timeout + 8MB cap sağlam; imza-bazlı reconcile saf/testli; unknown frontmatter sessizce yutulur (dokümante); README doğruluğu yüksek.

## Öncelikli aksiyonlar

1. dsh-web plugin-route auth sözleşmesini doğrula (gerekirse plugin-içi kontrol)
2. Timeout'ta process-tree kill

## Taranmadı

- dsh runtime registration anchoring canlı davranışı, `client.js` kalan ~570 satır, `examples/` roster pin'leri teker teker
