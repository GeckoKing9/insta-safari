#!/usr/bin/env bash
# Hand the iPhone from Windows to WSL (usbipd-win). Ubuntu's own socket-activated usbmuxd (systemd/udev)
# picks the device up by itself; never start a second daemon by hand, the two fight over the USB interface
# (LIBUSB_ERROR_BUSY) and the link dies after a session or two.
# Needs: phone plugged in + unlocked, Safari in front for page-level probes. First-time 'usbipd bind' done already.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PMD="$ROOT/.venv/bin/pymobiledevice3"
export USBMUXD_SOCKET_ADDRESS=/var/run/usbmuxd

B=$(powershell.exe -NoProfile -Command 'usbipd list' | tr -d '\r' | grep -i 'apple' | head -1 | awk '{print $1}')
[ -z "${B:-}" ] && { echo "iPhone not found on the Windows USB bus. Plug it in with a data cable and unlock it."; exit 1; }
STATE=$(powershell.exe -NoProfile -Command 'usbipd list' | tr -d '\r' | grep -i 'apple' | head -1 | awk '{print $NF}')
if [ "$STATE" = "Attached" ] && timeout 15 "$PMD" usbmux list 2>/dev/null | grep -q ProductVersion; then
  echo "already attached and answering (bus $B)"; exit 0
fi
pgrep -a usbmuxd | grep -q -- '-f -v' && sudo pkill -f 'usbmuxd -f -v' 2>/dev/null   # a leftover hand-started daemon
powershell.exe -NoProfile -Command "usbipd detach --busid $B" >/dev/null 2>&1; sleep 2
powershell.exe -NoProfile -Command "usbipd attach --wsl --busid $B" 2>&1 | tr -d '\r' | grep -i error
systemctl is-active --quiet usbmuxd.service || sudo systemctl start usbmuxd.service
for i in $(seq 1 12); do sleep 2; timeout 10 "$PMD" usbmux list 2>/dev/null | grep -q ProductVersion && break; done
if timeout 10 "$PMD" usbmux list 2>/dev/null | grep -q ProductVersion; then
  echo "attached (bus $B), iOS $("$PMD" lockdown info 2>/dev/null | grep -oE '"ProductVersion": "[^"]+"' | cut -d'"' -f4)"
else
  echo "NOT answering; system daemon: $(systemctl is-active usbmuxd.service)"; exit 1
fi
