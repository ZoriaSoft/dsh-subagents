#!/usr/bin/env bash
# dsh-subagents — smoke test: unit tests, then (if a dsh-web instance is up)
# the live debug route.
# Usage: bash scripts/smoke.sh [base-url]   (default http://127.0.0.1:3080)
set -u
cd "$(dirname "$0")/.."
fails=0

echo "== unit tests =="
node --test || fails=$((fails + 1))

BASE="${1:-http://127.0.0.1:3080}"
DEBUG="$BASE/plugins/dsh-subagents/debug"
if curl -fsS --max-time 5 "$DEBUG" >/dev/null 2>&1; then
	echo "== live debug route @ $BASE =="
	body() { curl -fsS --max-time 10 "$DEBUG"; }
	check() {
		local name="$1" want="$2" got="$3"
		if [[ "$got" == *"$want"* ]]; then echo "PASS  $name"
		else echo "FAIL  $name — expected '$want'"; fails=$((fails + 1)); fi
	}
	check "route answers" '"agentsDir"' "$(body)"
	check "agent tools registered" 'agent_' "$(body | grep -o '"agent_[a-z0-9_-]*"' | sort -u | head -1)"
else
	echo "== live debug route skipped (no dsh-web at $BASE) =="
fi

if [[ $fails -eq 0 ]]; then echo "== ALL PASS =="; else echo "== $fails FAILED =="; fi
exit $fails
