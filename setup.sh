#!/bin/sh
# Zoria repo kurulumu — hook'ları etkinleştir (macOS/Linux/Git Bash)
set -e
git config core.hooksPath .githooks
echo "✅ Zoria secret-guard kuruldu (core.hooksPath=.githooks)"
echo "   Kural seti: Projects/zoria-standards/AGENTS.md"
