#!/usr/bin/env bash
# Full USB/IP cycle: the link only survives about one Web Inspector session, so run this before each one.
# Kills the device daemon first (it holds the USB interface through usbfs), then detach/attach, then a clean daemon.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
sudo pkill usbmuxd 2>/dev/null; for i in 1 2 3 4 5; do pgrep -x usbmuxd >/dev/null || break; sleep 1; done
pgrep -x usbmuxd >/dev/null && sudo pkill -9 usbmuxd
B=$(powershell.exe -NoProfile -Command 'usbipd list' | tr -d '\r' | grep -i apple | head -1 | awk '{print $1}')
[ -z "${B:-}" ] && { echo "iPhone not on the Windows USB bus"; exit 1; }
powershell.exe -NoProfile -Command "usbipd detach --busid $B" >/dev/null 2>&1; sleep 3
powershell.exe -NoProfile -Command "usbipd attach --wsl --busid $B" 2>&1 | tr -d '\r' | grep -i error
sleep 6
sudo rm -f /var/run/usbmuxd.pid /var/run/usbmuxd
nohup sudo usbmuxd -f -v > "$ROOT/sim/usbmuxd.log" 2>&1 &
for i in 1 2 3 4 5 6 7 8 9 10; do sleep 2; grep -q 'Finished preflight' "$ROOT/sim/usbmuxd.log" && break; done
grep -q 'Finished preflight' "$ROOT/sim/usbmuxd.log" && echo "attached (bus $B)" || { echo "NOT attached:"; grep -iE 'busy|error' "$ROOT/sim/usbmuxd.log" | tail -2; exit 1; }
