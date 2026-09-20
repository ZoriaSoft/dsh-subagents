# Değerlendirme Raporu — dsh-subagents

**Tarih:** 2026-09-20 · **Tür:** filo taraması (statik/metadata + koşulan deterministik kapılar; tam zoria-review değil)
**Kapsam:** `/home/workspace/Projects/dsh-subagents` · **Stack:** Node
**Commit:** `2026-09-20|b1925f2|fix(runners): cli listesi daraltıldı — cmdc/pi/claude/dsh kaldırıldı (agy/vibe/devin kaldı)` · branch `main` · dirty 0 · unpushed 0 · 30 commit
**Remote:** `https://github.com/ZoriaSoft/dsh-subagents.git`
**Koşulan kapılar:** security-audit

## Özet

| Kategori | Durum | Not |
|---|---|---|
| Yapı / Mimari | PASS | 3/8 kanonik doc; top dirs: .githooks, .github, bin, docs, examples, lib, scripts, skills |
| Tasarım / UI | N/A | UI yüzeyi yok |
| Güvenlik | PASS | 0 kaynak hit'i + 0 vendored/artefakt hit'i |
| Güncellik | PASS | son commit: 2026-09-20 |
| Test / CI | NOT_VERIFIED | 8 test dosyası · analyze: koşulmadı · workflow: 1 |
| Git / hijyen | PASS | dirty 0 · unpushed 0 |

**Genel durum: SAĞLIKLI** — indicative puan 9.0/10 (sinyal-bazlı; görsel/runtime kanıtlar kapsam dışı).

## Proje kimliği

dsh rol sistemi + dsh-roles.mjs headless kopru (fusion enforce).

**Güncel durum:** Bugunku commit b1925f2; tool-filter fix + 81 test gecmisti (09-19 MEMORY).

## Metrikler

| Metrik | Değer |
|---|---|
| LOC (kod) | 3,609 — js:3,517, sh:92 |
| Dosya | 48 · 0.3MB |
| Test dosyası | 8 |
| TODO/FIXME | 0 |
| package.json | dsh-subagents 0.10.0 · scripts: test, smoke |
| Dokümanlar | MEMORY.md, CHANGELOG.md, README.md |
| docs/ | 1 dosya |
| CI | ci.yml |

## Bulgular

- Belirgin bulgu yok (sinyal seviyesinde temiz).

## Öncelikli adımlar

1. Roster/model pinlerini MODEL_SCORECARD ile senkron tut.

## Yöntem ve sınırlar

- Bu rapor filo taramasıdır: manifest/git/doküman metrikleri + koşulan kapılar (security-audit). `flutter test`, `tsc`, `wrangler deploy --dry-run`, görsel/render ve bağımsız reviewer kapıları koşulmadı → ilgili kategoriler NOT_VERIFIED sayılır.
- Security hit'leri statik regex tabanlıdır; vendored/build artefaktı ayrı işaretlendi, false-positive mümkündür — secret değerleri rapora kopyalanmaz (RL-SECRET).
- Puan indicative'dir; merge/publish izni değildir. Tam değerlendirme için `zoria-review` akışı gerekir.
