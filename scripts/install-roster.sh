#!/usr/bin/env bash
# Install the bundled subagent roster + role skills into a DSH home.
#
# Roles → $DSH_HOME/agents (definition files; the plugin hot-reloads them).
# Skills → $DSH_HOME/subagent-skills (the plugin's skillsDirs default).
#   Override either with DSH_HOME or SKILLS_DIR. Idempotent: re-runs copy.
#
# Note: definition-file changes hot-reload into the next turn. Lib-level
# features (skills inlining, new tools surface) activate after a dsh-web
# restart, which drops live sessions.
set -euo pipefail
cd "$(dirname "$0")/.."

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
AGENTS_DIR="${AGENTS_DIR:-$DSH_HOME/agents}"
SKILLS_DIR="${SKILLS_DIR:-$DSH_HOME/subagent-skills}"

mkdir -p "$AGENTS_DIR" "$SKILLS_DIR"

echo "== installing roles → $AGENTS_DIR =="
shopt -s nullglob
copied=0
for f in examples/*.md; do
    base="$(basename "$f")"
    case "$base" in
        _*) continue ;;   # disabled role files stay out of the live roster
    esac
    cp "$f" "$AGENTS_DIR/$base"
    copied=$((copied + 1))
done
echo "   $copied role(s)"

echo "== installing role skills → $SKILLS_DIR =>"
copied=0
for d in skills/*/; do
    [ -f "${d}SKILL.md" ] || continue
    name="$(basename "$d")"
    mkdir -p "$SKILLS_DIR/$name"
    cp "${d}SKILL.md" "$SKILLS_DIR/$name/SKILL.md"
    copied=$((copied + 1))
done
echo "   $copied skill(s)"

echo "✓ done. Verify: curl -s http://127.0.0.1:3080/plugins/dsh-subagents/debug | python3 -m json.tool"
