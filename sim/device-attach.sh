#!/usr/bin/env bash
# Hand the iPhone from Windows to WSL (usbipd-win), start the device daemon cleanly, confirm Web Inspector answers.
# Needs: phone plugged in + unlocked, Safari in the foreground, Web Inspector on. First-time 'usbipd bind' done already.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PMD="$ROOT/.venv/bin/pymobiledevice3"
export USBMUXD_SOCKET_ADDRESS=/var/run/usbmuxd

BUSID=$(powershell.exe -NoProfile -Command 'usbipd list' | tr -d '\r' | grep -i 'apple' | head -1 | awk '{print $1}')
[ -z "${BUSID:-}" ] && { echo "iPhone not found on the Windows USB bus. Plug it in with a data cable and unlock it."; exit 1; }
echo "[1] attaching bus $BUSID to WSL"
powershell.exe -NoProfile -Command "usbipd attach --wsl --busid $BUSID" 2>&1 | tr -d '\r' | grep -iE 'error|already' || true
sleep 5
echo "[2] device daemon (clean restart, after the USB device settled)"
sudo pkill usbmuxd 2>/dev/null; sleep 1; sudo rm -f /var/run/usbmuxd.pid /var/run/usbmuxd
nohup sudo usbmuxd -f -v > "$ROOT/sim/usbmuxd.log" 2>&1 &
for i in 1 2 3 4 5 6; do sleep 2; grep -q 'Finished preflight' "$ROOT/sim/usbmuxd.log" && break; done
grep -q 'Finished preflight' "$ROOT/sim/usbmuxd.log" && echo "    phone preflighted" || { echo "    no preflight yet; log tail:"; tail -3 "$ROOT/sim/usbmuxd.log"; }
echo "[3] iOS version:"
timeout 30 "$PMD" lockdown info 2>&1 | grep -E '"(ProductVersion|DeviceName)"' || echo "    lockdown not answering (unlock the phone, tap Trust)"
echo "[4] Safari tabs visible to Web Inspector:"
timeout 45 "$PMD" webinspector opened-tabs 2>&1 | grep -v ServiceWorker | tail -5
echo "Run checks with: USBMUXD_SOCKET_ADDRESS=/var/run/usbmuxd $ROOT/.venv/bin/python $ROOT/sim/device_check.py"
