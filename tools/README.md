# Prodigy field tools

Companion tools for the hardware plan in
[docs/prodigy-development-guide.md](../docs/prodigy-development-guide.md).
Both are read-only: they never send correction, reset, calibration,
Wi-Fi, or rotation commands to the board.

## prodigy-inspect.sh — Phase 0 SD inventory (Linux)

Run against a read-only mounted clone of Board A's stock SD card:

```sh
sudo losetup --find --show --partscan --read-only prodigy-board-a-stock.img
lsblk -f /dev/loopX                        # find the root partition
sudo mkdir -p /mnt/prodigy-root
sudo mount -o ro,noload /dev/loopXpN /mnt/prodigy-root
sudo bash tools/prodigy-inspect.sh /mnt/prodigy-root prodigy-inventory.txt
```

The report answers the guide's §36 unknowns (architecture, init system,
service names, display backend, storage layout). Send it back to fill in
every `<PLACEHOLDER>` in guide §18/§29.

## prodigy-logger.mjs — Phase 1 protocol capture (Node 21+)

Run on a laptop on the same network as the board:

```sh
NODE_TLS_REJECT_UNAUTHORIZED=0 node tools/prodigy-logger.mjs \
  wss://<board-ip>:9001 captures/board-a-$(date +%Y%m%d).log
```

It records the board certificate's SHA-256 fingerprint, sends only the
read-only `get_*` commands, and logs every raw protocol line with a
timestamp plus the normalized event (via `lib/prodigy/parser.js`).
Relaxed TLS verification is for lab capture only, exactly as guide §8.6
describes; production pins the captured fingerprint.

While it runs, throw the guide §30.2 test matrix (singles/doubles/
triples 1–20, both bulls, deliberate miss, bounce-out, close pairs,
removal variations). The capture file becomes the firmware-pinned
fixture set for the board bridge.
