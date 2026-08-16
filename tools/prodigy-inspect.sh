#!/usr/bin/env bash
# Prodigy SD-image inventory (guide §13–14 — Phase 0).
#
# Run on Linux against a READ-ONLY mounted clone of Board A's stock SD
# card. It gathers everything needed to resolve the guide's §36 unknowns
# into one report file to send back:
#
#   sudo losetup --find --show --partscan --read-only prodigy-board-a-stock.img
#   sudo mkdir -p /mnt/prodigy-root
#   sudo mount -o ro,noload /dev/loopXpN /mnt/prodigy-root   # root partition
#   sudo bash tools/prodigy-inspect.sh /mnt/prodigy-root prodigy-inventory.txt
#
# The script only READS the mounted tree. Nothing is modified.
set -u

ROOT="${1:-}"
OUT="${2:-prodigy-inventory.txt}"
if [ -z "$ROOT" ] || [ ! -d "$ROOT" ]; then
  echo "usage: $0 <mounted-root-dir> [report-file]" >&2
  exit 1
fi

exec > >(tee "$OUT") 2>&1

section() { printf '\n===== %s =====\n' "$1"; }

section "report"
date -u +"generated %Y-%m-%dT%H:%M:%SZ"
echo "root: $ROOT"

section "block devices / partitions (host view)"
lsblk -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINTS 2>/dev/null || true

section "os-release / version files"
for f in etc/os-release etc/version etc/build etc/issue; do
  [ -f "$ROOT/$f" ] && { echo "--- $f"; cat "$ROOT/$f"; }
done

section "init system"
ls -l "$ROOT/sbin/init" 2>/dev/null
file "$ROOT/sbin/init" 2>/dev/null
[ -f "$ROOT/etc/inittab" ] && { echo "--- etc/inittab"; cat "$ROOT/etc/inittab"; }

section "fstab"
[ -f "$ROOT/etc/fstab" ] && cat "$ROOT/etc/fstab"

section "top-level layout"
find "$ROOT" -maxdepth 2 -type d 2>/dev/null | sed "s|^$ROOT|.|" | sort

section "systemd units (if any)"
find "$ROOT/lib/systemd" "$ROOT/usr/lib/systemd" "$ROOT/etc/systemd" -name '*.service' -o -name '*.target' 2>/dev/null | sort
echo "--- default.target"
readlink "$ROOT/etc/systemd/system/default.target" 2>/dev/null
echo "--- enabled symlinks"
find "$ROOT/etc/systemd/system" -type l -ls 2>/dev/null
echo "--- unit contents mentioning dart/prodigy/qt/display"
grep -RIlE 'dart|prodigy|location|qml|qt|weston|eglfs|linuxfb|xcb|wayland' \
  "$ROOT/lib/systemd" "$ROOT/usr/lib/systemd" "$ROOT/etc/systemd" 2>/dev/null | while read -r u; do
  echo "----- $u"; sed -n '1,120p' "$u"
done

section "sysv init (if any)"
find "$ROOT/etc/init.d" -type f 2>/dev/null | sort
find "$ROOT"/etc/rc*.d -type l -ls 2>/dev/null
[ -f "$ROOT/etc/rc.local" ] && { echo "--- rc.local"; cat "$ROOT/etc/rc.local"; }

section "session / autostart"
for d in etc/xdg/autostart home/root; do
  [ -e "$ROOT/$d" ] && find "$ROOT/$d" -maxdepth 2 -type f -print 2>/dev/null
done
for f in home/root/.profile home/root/.xinitrc; do
  [ -f "$ROOT/$f" ] && { echo "--- $f"; cat "$ROOT/$f"; }
done

section "executable architecture (sample)"
find "$ROOT/usr/bin" "$ROOT/usr/sbin" "$ROOT/opt" "$ROOT/home" -type f -perm -0100 2>/dev/null | head -40 | while read -r b; do
  file "$b" | sed "s|^$ROOT|.|"
done

section "qt / dart / prodigy artifacts"
find "$ROOT" \( -iname '*qt*' -o -iname '*dart*' -o -iname '*prodigy*' -o -iname '*location*' \) \
  -not -path '*/share/doc/*' 2>/dev/null | sed "s|^$ROOT|.|" | sort | head -200

section "boot config mentioning display/services"
grep -RInE 'ExecStart|qml|dart|prodigy|location|weston|eglfs|linuxfb|xcb|wayland|QT_QPA' \
  "$ROOT/etc" 2>/dev/null | head -120

section "storage layout inside image"
df -h "$ROOT" 2>/dev/null
du -sh "$ROOT"/* 2>/dev/null | sort -rh | head -20

section "done"
echo "Report written to $OUT — send this file back for placeholder resolution."
