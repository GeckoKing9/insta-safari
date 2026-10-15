#!/usr/bin/env bash
# The loop's checker: the harness, then the phone. Prints failing items one per line; exit 0 only when both pass.
# Phone: plugged in, unlocked, Safari in front on instagram.com, script pushed and the tab reloaded.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export USBMUXD_SOCKET_ADDRESS=/var/run/usbmuxd
out=$(timeout 300 node "$ROOT/sim/check.js" 2>&1); harness=$?
grep -E '^FAIL|ALL PASS|failing' <<<"$out"
out=$(cd "$ROOT/sim" && timeout 240 "$ROOT/.venv/bin/python" device_check.py 2>&1); device=$?
grep -E '^FAIL|DEVICE PASS|failing|Error' <<<"$out"
[ "$harness" -eq 0 ] && [ "$device" -eq 0 ]
