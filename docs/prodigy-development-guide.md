# Blackbird + Prodigy D9000W Development Guide

**Document status:** Architecture and implementation guide  
**Version:** 1.0  
**Date:** August 16, 2026  
**Target:** Blackbird v1.3 and Escalade Prodigy D9000W  
**Requested output filename:** `develop,ent-guide.mnd`

> This guide is intentionally conservative about the Prodigy boot filesystem. The public manuals identify the hardware access procedure and the Yocto/Qt software family, while static inspection of the current client reveals the board protocol. The exact service names, CPU architecture, display backend, partition layout, and writable paths must be read from your own board's SD card before the example boot files are installed. Placeholders such as `<PRODIGY_UI_SERVICE>` are not commands to run literally.

---

## Table of contents

1. [Executive decision](#1-executive-decision)
2. [What the completed system should do](#2-what-the-completed-system-should-do)
3. [Evidence, confidence levels, and sources](#3-evidence-confidence-levels-and-sources)
4. [What is inside the Prodigy](#4-what-is-inside-the-prodigy)
5. [What is inside the current Blackbird application](#5-what-is-inside-the-current-blackbird-application)
6. [Recommended end-state architecture](#6-recommended-end-state-architecture)
7. [How local-only play and later app logging work](#7-how-local-only-play-and-later-app-logging-work)
8. [The Prodigy protocol seam](#8-the-prodigy-protocol-seam)
9. [Protocol parser and normalized event contract](#9-protocol-parser-and-normalized-event-contract)
10. [Hardware-aware game state machine](#10-hardware-aware-game-state-machine)
11. [Preparing the two boards](#11-preparing-the-two-boards)
12. [Opening the board and cloning the SD card](#12-opening-the-board-and-cloning-the-sd-card)
13. [Inspecting the SD card without changing it](#13-inspecting-the-sd-card-without-changing-it)
14. [Discovering the real boot process](#14-discovering-the-real-boot-process)
15. [Choosing the on-board runtime](#15-choosing-the-on-board-runtime)
16. [Recommended on-board software layout](#16-recommended-on-board-software-layout)
17. [Building the on-board Blackbird UI](#17-building-the-on-board-blackbird-ui)
18. [Booting Blackbird instead of the vendor scorer](#18-booting-blackbird-instead-of-the-vendor-scorer)
19. [Fail-safe startup and factory fallback](#19-fail-safe-startup-and-factory-fallback)
20. [Local SQLite database and outbox](#20-local-sqlite-database-and-outbox)
21. [Pairing the board to the Blackbird app](#21-pairing-the-board-to-the-blackbird-app)
22. [Vercel ingestion API](#22-vercel-ingestion-api)
23. [Supabase schema and RLS design](#23-supabase-schema-and-rls-design)
24. [Supabase Realtime delivery](#24-supabase-realtime-delivery)
25. [Refactoring the Blackbird scoring engines](#25-refactoring-the-blackbird-scoring-engines)
26. [Game finalization, Elo, and analytics](#26-game-finalization-elo-and-analytics)
27. [Security model](#27-security-model)
28. [Networking modes](#28-networking-modes)
29. [Installation procedure on the development SD card](#29-installation-procedure-on-the-development-sd-card)
30. [Calibration and protocol test matrix](#30-calibration-and-protocol-test-matrix)
31. [Functional and failure testing](#31-functional-and-failure-testing)
32. [Operations, diagnostics, and recovery](#32-operations-diagnostics-and-recovery)
33. [Updates and version management](#33-updates-and-version-management)
34. [Delivery phases and estimates](#34-delivery-phases-and-estimates)
35. [Acceptance criteria](#35-acceptance-criteria)
36. [Unknowns that must be resolved from the real SD card](#36-unknowns-that-must-be-resolved-from-the-real-sd-card)
37. [Source register](#37-source-register)

---

## 1. Executive decision

The recommended design is:

1. Keep the Prodigy's existing location engine, cameras, illumination, rotation calibration, and dart-removal detection.
2. Stop only the original Prodigy scoring user interface at boot.
3. Boot a new full-screen Blackbird Qt/QML user interface on the board's HDMI output.
4. Connect that interface to the local location engine at `wss://127.0.0.1:9001`.
5. Run all game rules locally so X01, Cricket, Baseball, and future games work without a phone, internet connection, Vercel, or Supabase.
6. Save every game and dart event in a local SQLite database before attempting cloud delivery.
7. When the board has internet and is paired with a Blackbird account, send queued events outward to a Vercel ingestion endpoint.
8. Let Vercel authenticate the board and write durable events to Supabase.
9. Use private Supabase Realtime channels to update a connected Blackbird app or TV immediately.
10. Keep the original SD card untouched and maintain a physical factory fallback.

This is not a full replacement of Prodigy's computer-vision firmware. It is a replacement of the scoring interface and game software while retaining the part of the board that already answers the difficult question: **where did the dart land?**

### The final boot flow

```text
Power on
  -> Yocto Linux starts
  -> Prodigy location engine starts
  -> Blackbird services start
  -> Blackbird UI opens full-screen on HDMI
  -> Blackbird UI connects to 127.0.0.1:9001
  -> local profile/game selection appears
  -> darts are scored locally
  -> every event is committed to SQLite
  -> cloud synchronization happens only when available
```

### The final data flow

```text
Prodigy cameras/impact trigger
        |
        v
Prodigy location engine
        |
        | local secure WebSocket, port 9001
        v
Blackbird board service
        |---------------------> Blackbird local Qt/QML UI
        |                         local rules and HDMI display
        |
        +---------------------> SQLite event log/outbox
                                  |
                                  | outbound HTTPS when online
                                  v
                              Vercel API
                                  |
                                  v
                              Supabase Postgres
                                  |
                                  +--> private Realtime --> web/mobile/TV
                                  +--> game results, Elo, analytics
```

---

## 2. What the completed system should do

### 2.1 Local behavior

The board must be useful with no app and no internet:

- Boot directly into Blackbird.
- Display the game picker on the HDMI-connected screen.
- Accept a USB keyboard/mouse initially; later support a simplified remote or touch input if desired.
- Run X01, Cricket, and Baseball locally.
- Receive automatic dart hits from the Prodigy location engine.
- Detect removal/reset and advance the turn.
- Allow manual correction, undo, miss, and end-turn entry.
- Preserve an interrupted game across a UI or board restart.
- Store completed games locally until they have been acknowledged by the cloud.
- Continue playing if DNS, Wi-Fi, Vercel, Supabase, or the user's phone is unavailable.

### 2.2 Connected behavior

When the Blackbird app is connected or the board is already paired:

- The app can select or join the board's current game.
- Live dart events appear in the app and TV view.
- The app may act as a remote, spectator display, or correction surface.
- Completed games are associated with the correct Blackbird account and players.
- Already completed offline games are uploaded exactly once.
- Elo and aggregate statistics are updated exactly once.
- A network reconnect does not duplicate darts or game results.

### 2.3 Explicit non-goals for the first release

- Replacing the camera drivers or location algorithm.
- Rebuilding the entire Prodigy operating system.
- Modifying the encrypted official firmware update.
- Supporting the original Prodigy mobile app as a simultaneous scoring authority.
- Sending raw camera images to Supabase.
- Requiring a permanent WebSocket connection to Vercel.

---

## 3. Evidence, confidence levels, and sources

Three kinds of information are used in this guide.

### 3.1 Confirmed by official documentation

These facts are documented by Escalade:

- The D9000W supports smart-device-only, HDMI-only, and HDMI-plus-smart-device operation.
- It has HDMI, audio, Ethernet, and USB keyboard/mouse connectivity.
- It supports wired Ethernet, Wi-Fi access-point mode, and Wi-Fi client mode.
- Access-point mode and Wi-Fi client mode are mutually exclusive.
- The scoring system uses cameras, infrared illumination, and location algorithms.
- Dart removal advances play.
- The maintenance interface exposes live views from both cameras and last-score images.
- External vibration can falsely trigger scoring.
- The board can be opened to access its SD card.
- The Qt libraries on the SD card were built from the Yocto-era `meta-qt5` `sumo` recipe.
- Software or hardware modification voids the stated warranty.

Primary sources are listed in [Section 37](#37-source-register).

### 3.2 Confirmed by static inspection of the current Prodigy client

These are interoperability observations, not a vendor-supported API:

- The current client discovers `_dartboard._tcp` via mDNS/ZeroConf.
- It connects to secure WebSocket port `9001`.
- The on-board configuration uses `127.0.0.1` and identifies Linux/Unix as the master UI.
- The mobile/client configuration uses non-master mode.
- Protocol records are CRLF-terminated text lines.
- Messages include `Dart:`, `ExtDart:`, `Reset:`, `Clarity:`, `Metadata:`, `GameState:`, notifications, questions, and Wi-Fi scan results.
- The client asks for location-engine version, board information, disk space, clarity, brightness, and trigger threshold.
- A dart can arrive as two or five comma-separated fields.
- Metadata can include the board serial, system version, location-engine version, board rotation, brightness, sensitivity, and storage information.
- The vendor client configures relaxed TLS peer verification. A normal web browser cannot generally make the same exception for a private-IP certificate.

These observations must be version-pinned and re-tested after any Prodigy firmware change.

### 3.3 Recommended engineering decisions

These are design choices made for Blackbird:

- A local Qt/QML UI is preferable to deploying the Next.js project directly on the old embedded system.
- SQLite should be the board's local source of truth.
- The cloud should receive append-only, idempotent events.
- Vercel should accept short HTTPS requests rather than own the LAN-to-board socket.
- Supabase Realtime should distribute live state, while Postgres remains the durable record.
- One custom scoring reducer should be shared by manual and hardware input.
- The vendor UI should remain recoverable but not run simultaneously as a second scoring authority.

---

## 4. What is inside the Prodigy

### 4.1 Physical and operator-facing interfaces

The official D9000W manual identifies:

- A power switch at the back/bottom center.
- Ethernet and USB keyboard/mouse access at the bottom of the electronics box.
- HDMI and audio output.
- A mode where the board is operated with only a TV/monitor and USB keyboard/mouse.
- A mode where a smart device is the primary display.
- A mode where HDMI is the display and a smart device acts as a remote.

These interfaces make a local Blackbird UI practical. A development setup should include:

- HDMI monitor.
- USB keyboard and mouse.
- Wired Ethernet whenever possible.
- A switched power strip so the board can be powered down before physical SD-card work.

### 4.2 Vision and event pipeline

Escalade describes the system as bi-ocular recognition using cameras, infrared lighting, and location algorithms. The associated patent describes a pipeline that:

1. Captures reference views from two cameras.
2. Detects that a dart was thrown, potentially using a vibration-related sensor.
3. Captures new views.
4. Determines the dart in each image relative to the reference.
5. Calculates angles from the camera observations.
6. Triangulates the dart location.
7. Maps the position to a score.

The official troubleshooting material also says that nearby stomping or hammering can trigger scoring even when no dart was thrown. This is why Blackbird must retain correction and undo controls even when automatic scoring is enabled.

### 4.3 Camera clarity and maintenance

The original UI represents camera status with white, yellow, and red conditions. The manual instructs the owner to inspect the background, remove protruding sisal fibers, keep the board seated in its indexed rotation position, and use the live camera views when troubleshooting.

Blackbird should expose the received `Clarity:` status and provide equivalent warnings:

- **Clear:** automatic scoring enabled.
- **Degraded:** warn the player; retain automatic scoring and highlight correction.
- **Poor:** suggest cleaning/inspection; offer a one-tap manual mode.

The local UI should never hide a red/poor clarity state merely because the cloud is disconnected.

### 4.4 Rotation

The physical bristle board rotates to distribute wear. The original software keeps a matching rotation index. Blackbird must not invent a new rotation mapping. It should read current metadata, preserve the known board rotation, and initially send no rotation-setting command.

For the first release, use the original UI or a service screen for rotation changes. After the exact command has been captured and validated, Blackbird can expose it with confirmation and a visual dot-position guide.

### 4.5 Embedded operating system

Escalade's SD-card document states that the Qt libraries on the card were built with the `meta-qt5` `sumo` recipe. This is strong evidence of a Yocto Linux image with Qt 5-era libraries. It does **not** identify:

- The CPU architecture.
- Whether the image uses systemd, SysV init, or a hybrid.
- The compositor/display backend.
- Whether the root filesystem is writable.
- The exact Qt patch version and enabled modules.
- The names of the location-engine and UI services.

Those items must be discovered from the real SD image.

### 4.6 Official firmware updates

The official instructions describe copying the board-only firmware file to USB and applying it at the board. The file must keep its expected name; a browser-added duplicate suffix may cause the board to ignore it.

Static inspection of the published 1.2.8 image indicates that the payload is an encrypted envelope rather than a normal disk image or tar archive. Therefore:

- Do not plan to unpack, modify, and repack the official updater.
- Do not overwrite your custom SD installation with an official update without first restoring the stock card and retesting the protocol.
- Maintain a firmware compatibility table for each Blackbird bridge build.

---

## 5. What is inside the current Blackbird application

The supplied Blackbird archive is a Next.js 14.2.5 / React 18 application using `@supabase/supabase-js` 2.x. It currently has four primary dependencies: Next.js, React, React DOM, and Supabase JS.

### 5.1 Existing game engines

The application already supports:

- X01 with straight/double-out behavior, bust handling, checkout data, turn history, per-dart statistics, and undo.
- Cricket with standard, cutthroat, and no-score variants, MPR, per-round marks, points, and undo.
- Baseball with nine innings, extra innings, per-inning totals, and undo.

The existing common dart representation is:

```js
{ n: 20, mult: 3 }
```

Other examples:

```js
{ n: 25, mult: 1 } // outer bull
{ n: 25, mult: 2 } // inner bull
{ n: 0,  mult: 0 } // miss
```

This matches the important part of the Prodigy event with almost no translation.

### 5.2 Current persistence behavior

The current web application:

- Keeps live progress in React memory.
- Writes only completed games to `game_results`.
- Stores one row per player per game.
- Updates Elo after result insertion.
- Uses broad authenticated-member RLS policies.
- Pulls all result rows and derives aggregate statistics in the browser.

Hardware input changes the reliability requirements. Live games can no longer exist only in browser memory because the board must survive restarts and offline play. Completed-game insertion and Elo changes also need one transactional/idempotent finalization path.

### 5.3 Current casting behavior

Blackbird already uses Supabase Realtime Broadcast for phone-to-TV state. The production channel format is `cast:<CODE>`. That implementation is useful, but raw board events should use a separate private topic and ownership model.

The existing TV cast may remain a derived spectator feed. Do not expose device credentials or raw board-control messages through the public cast channel.

### 5.4 Required source refactor

The current `PlayX01`, `PlayCricket`, and `PlayBaseball` components each own their input functions. Hardware support should introduce these layers:

```text
manual controls -----+
keyboard ------------+--> submitDart(event) --> game reducer --> snapshot
Prodigy bridge ------+
replay/recovery -----+
```

The UI should render state; it should not be the only place where rules exist.

---

## 6. Recommended end-state architecture

### 6.1 Components on the board

**`blackbird-boardd`**

- Connects to the Prodigy location engine.
- Parses and validates protocol lines.
- Generates normalized events.
- Writes events to SQLite.
- Exposes a local IPC interface to the UI.
- Manages the cloud outbox.
- Reports metadata and health.

**`blackbird-ui`**

- Full-screen Qt/QML HDMI interface.
- Runs game setup and local scoring.
- Consumes normalized events from `blackbird-boardd`.
- Displays connectivity, clarity, pending upload count, and pairing state.
- Provides manual corrections and factory-UI fallback.

**`blackbird-sync`**

- May be part of `blackbird-boardd` for the first release.
- Sends queued events to Vercel over HTTPS.
- Uses exponential backoff with jitter.
- Marks an event acknowledged only after a valid server response.

**SQLite database**

- Local profiles.
- Games.
- Dart/reset/correction events.
- Reducer snapshots.
- Pairing metadata.
- Outbox.

### 6.2 Components in Vercel

- `POST /api/board-events`: device-authenticated event ingestion.
- `POST /api/boards/pair/start`: authenticated user starts pairing.
- `POST /api/boards/pair/complete`: completes board/user association.
- `POST /api/board-games/:id/finalize`: idempotently finalizes a game.
- Existing Blackbird pages and TV view.

Use the default Node.js runtime for cryptography, Supabase server access, and payload validation. The board should not hold a WebSocket open to a Vercel Function. Vercel can host WebSockets under Fluid Compute, but cloud functions remain duration-bound and cannot initiate a connection into the board's private LAN. Short outbound HTTPS requests solve the actual problem.

### 6.3 Components in Supabase

- Auth remains the user identity source.
- Postgres stores boards, paired games, raw events, results, and analytics.
- RLS restricts device/game data to the owner or an explicit participant.
- Realtime sends private live events to connected Blackbird clients.
- A server-only secret key is used only inside Vercel.

### 6.4 Authority model

There must be one canonical sequence of hardware events. The recommended authority is:

1. The board writes the event locally and assigns `(board_id, boot_id, seq)`.
2. The local reducer updates immediately.
3. The cloud accepts that immutable identifier exactly once.
4. Every client reduces the same ordered events.
5. Corrections append events instead of silently rewriting prior records.

This prevents the HDMI UI, phone, and TV from each inventing a different score.

---

## 7. How local-only play and later app logging work

### 7.1 Board already paired to a user

This is the simplest daily experience:

1. The board boots Blackbird.
2. The owner selects local players and a game.
3. The board creates a random local game UUID.
4. The game is played and stored entirely in SQLite.
5. If internet is available, events upload during play.
6. If internet is unavailable, the outbox remains pending.
7. When connectivity returns, the board uploads in order.
8. Opening the app shows the already synced game or its live state.

The app does not need to be open during play.

### 7.2 Board not yet paired

The board should still work:

1. Games are marked `unclaimed` locally.
2. The Blackbird UI shows a pairing code or QR code when requested.
3. The signed-in user enters/scans it in the Blackbird app.
4. The server associates the board with that user.
5. The board receives confirmation on its next outbound request.
6. The UI asks whether to upload the unclaimed backlog.

Do not automatically assign months of old local games to the first person who pairs. Offer:

- Upload games since pairing.
- Select previous games to claim.
- Leave prior games local-only.

### 7.3 Shared board with several users

For a league or household, distinguish:

- **Board owner/admin:** can enroll, revoke, update, and factory-reset Blackbird.
- **Local player profile:** may be a nickname with no account.
- **Cloud participant:** a Supabase user explicitly mapped to a local player for a game.

The board can remain owned by one account while games include other linked users. A later `board_game_participants` table can support this without weakening board ownership.

### 7.4 What “connect my app” means

There are two useful connection types:

**Cloud connection**

- The board and phone do not need to be on the same LAN.
- Both connect outbound to Supabase/Vercel.
- Best for logging, spectators, and account association.

**Local companion connection**

- A native Blackbird companion discovers the board via mDNS.
- Useful for setup and diagnostics when the internet is unavailable.
- A browser-only connection is less reliable because of private-network and certificate restrictions.

Cloud connection should be the standard user experience; local discovery should be an administrative convenience.

---

## 8. The Prodigy protocol seam

### 8.1 Discovery and endpoint

Observed client behavior:

```text
mDNS service: _dartboard._tcp
secure WebSocket: wss://<host>:9001
on-board host: 127.0.0.1
record delimiter: \r\n
```

The custom UI should use loopback when it runs on the board. This avoids LAN discovery for the primary scorer and eliminates routing changes when Wi-Fi changes.

### 8.2 Incoming dart messages

Observed forms:

```text
Dart: <section>,<ring>
Dart: <section>,<ring>,<radius>,<angle>,<scoreError>
```

Example:

```text
Dart: 20,3
Dart: 20,3,72.4,184.5,false
```

Interpretation:

- `section`: nominal board number; 25 represents bull; a miss representation must be calibrated.
- `ring`: score multiplier, normally 1, 2, or 3; bull permits 1 or 2.
- `radius`: precise radial measurement or normalized radius, depending on firmware; confirm units experimentally.
- `angle`: angular position in degrees.
- `scoreError`: the vendor client parses this as a Boolean; determine the displayed behavior with a known incorrect score.

Do not discard the extra fields. They enable future heat maps and correction analytics even though game scoring uses only section and multiplier.

### 8.3 Other incoming messages

```text
ExtDart: ...
Reset: ...
Clarity: <dartsInView>,<clarity>
Metadata: { ...JSON... }
GameState: ...
Notification: ...
Question: ...
ApScanResult: ...JSON...
```

Blackbird v1 should consume:

- `Dart`
- `Reset`
- `Clarity`
- `Metadata`

It should log but otherwise ignore unknown records. It should never crash on a new message prefix.

### 8.4 Useful read-only commands

The current client sends commands resembling:

```text
Command: get_le_version\r\n
Command: get_board_info\r\n
Command: get_disk_space\r\n
Command: get_clarity\r\n
Command: get_visible_brightness\r\n
Command: get_trigger_thold\r\n
```

The first bridge build should send only read-only requests. Defer brightness, sensitivity, rotation, Wi-Fi, correction, and reset commands until their exact side effects have been captured on the development board.

### 8.5 Correction and reset observations

The vendor client contains these outbound families:

```text
Correction: ...\r\n
GameAction: reset \r\n
```

Blackbird does not need to send a correction to the location engine merely to correct a local game. Record a `dart.corrected` or `dart.voided` event in Blackbird first. Add vendor correction output only if testing proves that the location engine needs it for removal tracking or its own diagnostics.

### 8.6 TLS

The vendor client relaxes certificate verification. A production Blackbird bridge should not simply disable TLS checks forever.

Recommended progression:

1. During read-only laboratory capture, allow the known local certificate and record its subject, issuer, validity, and SHA-256 fingerprint.
2. In production, pin the expected certificate or public key when stable.
3. If certificates change across firmware or boards, store a per-board fingerprint accepted during physical enrollment.
4. Bind the scorer to loopback on the board and never expose a control proxy to the public internet.

Certificate inspection from a machine that can reach the board may use:

```sh
openssl s_client -connect BOARD_IP:9001 -showcerts </dev/null
```

Fingerprint extraction:

```sh
openssl s_client -connect BOARD_IP:9001 </dev/null 2>/dev/null \
  | openssl x509 -noout -sha256 -fingerprint -subject -issuer -dates
```

---

## 9. Protocol parser and normalized event contract

### 9.1 Parser requirements

The socket can deliver:

- One partial line.
- Several lines in one frame.
- A line split across frames.
- Unknown lines.
- Invalid numeric data.

Maintain a buffer until `\r\n` is present. Never assume one WebSocket message equals one protocol record.

### 9.2 Reference JavaScript parser

This is suitable for the desktop proof of concept and as executable documentation. The embedded implementation may be C++/Qt.

```js
export class ProdigyParser {
  constructor(onEvent) {
    this.buffer = "";
    this.onEvent = onEvent;
  }

  push(chunk) {
    this.buffer += String(chunk);

    for (;;) {
      const end = this.buffer.indexOf("\r\n");
      if (end < 0) return;

      const line = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + 2);

      if (line) this.onEvent(parseProdigyLine(line));
    }
  }
}

export function parseProdigyLine(line) {
  if (line.startsWith("Dart:")) {
    const rawFields = line.slice(5).trim().split(",");

    if (rawFields.length !== 2 && rawFields.length !== 5) {
      return { type: "protocol.unknown", raw: line, reason: "dart-field-count" };
    }

    const n = Number.parseInt(rawFields[0], 10);
    const mult = Number.parseInt(rawFields[1], 10);
    const event = {
      type: "dart.detected",
      raw: line,
      dart: { n, mult }
    };

    if (rawFields.length === 5) {
      event.dart.r = Number.parseFloat(rawFields[2]);
      event.dart.theta = Number.parseFloat(rawFields[3]);
      event.dart.scoreError = rawFields[4].trim() === "true";
    }

    if (!isLegalDart(event.dart)) {
      return { type: "protocol.invalid", raw: line, parsed: event };
    }

    return event;
  }

  if (line.startsWith("Reset:")) {
    return { type: "darts.removed", raw: line };
  }

  if (line.startsWith("Clarity:")) {
    const [dartsInView, clarity] = line.slice(8).trim().split(",").map(Number);
    return {
      type: "board.clarity",
      raw: line,
      dartsInView,
      clarity
    };
  }

  if (line.startsWith("Metadata:")) {
    try {
      return {
        type: "board.metadata",
        raw: line,
        metadata: JSON.parse(line.slice(9).trim())
      };
    } catch {
      return { type: "protocol.invalid", raw: line, reason: "metadata-json" };
    }
  }

  return { type: "protocol.unknown", raw: line };
}

function isLegalDart(dart) {
  if (!Number.isInteger(dart.n) || !Number.isInteger(dart.mult)) return false;
  if (dart.n === 0) return dart.mult === 0 || dart.mult === 1; // verify actual miss form
  if (dart.n === 25) return dart.mult === 1 || dart.mult === 2;
  return dart.n >= 1 && dart.n <= 20 && dart.mult >= 1 && dart.mult <= 3;
}
```

The allowed miss form is deliberately permissive until testing establishes whether a firmware emits `0,0`, `0,1`, or another representation.

### 9.3 Canonical event envelope

```ts
type BoardEvent = {
  schema: 1;
  boardId: string;
  localGameId: string | null;
  bootId: string;
  seq: number;
  observedAt: string;
  receivedMonotonicMs: number;
  type:
    | "game.started"
    | "game.completed"
    | "game.abandoned"
    | "dart.detected"
    | "darts.removed"
    | "dart.corrected"
    | "dart.voided"
    | "turn.ended-manually"
    | "board.clarity"
    | "board.metadata"
    | "protocol.unknown"
    | "protocol.invalid";
  dart?: {
    n: number;
    mult: number;
    r?: number;
    theta?: number;
    scoreError?: boolean;
  };
  raw?: string;
};
```

### 9.4 Sequencing rules

- Generate a new random `bootId` every time `blackbird-boardd` starts.
- Start `seq` at zero and increment before committing each normalized event.
- Commit to SQLite before notifying the UI or cloud worker.
- Use `(boardId, bootId, seq)` as the global idempotency key.
- Use a separate local game UUID so events remain associated across daemon restarts.
- Record both the board's time and the server's receipt time; embedded clocks are not always correct.

---

## 10. Hardware-aware game state machine

### 10.1 Why the existing input behavior must change

Manual Blackbird entry commits turns according to button presses. Hardware adds a physical removal signal. The scoring reducer must distinguish:

- A provisional dart in the current visit.
- A rules-level bust or win.
- Three detected darts.
- Physical removal/reset.
- A correction before or after removal.

### 10.2 Recommended states

```text
READY_FOR_DART
  -> DARTS_PRESENT
  -> AWAITING_REMOVAL
  -> ADVANCE_TURN
  -> READY_FOR_DART

Exceptional:
  -> CORRECTION_REQUIRED
  -> GAME_FINISHED_AWAITING_REMOVAL
  -> SENSOR_DEGRADED
```

### 10.3 Event behavior

**On `dart.detected`:**

- Reject it if no game is active, but retain it in diagnostics.
- Append it to the visit.
- Apply provisional scoring.
- If it causes an X01 bust or win, lock further scoring input for the visit unless corrected.
- If it is the third dart, show “remove darts” but do not manufacture a reset.
- Store the raw and normalized event.

**On `darts.removed`:**

- If the visit contains darts, commit the turn and advance unless the game has ended.
- If the visit is empty, log an unexpected reset and do not change players.
- If the game ended, finalize only once, then return to the result screen.

**On manual correction:**

- Append `dart.corrected` with the original event ID and replacement dart.
- Rebuild the current game from the last snapshot plus events.
- Never mutate the original event out of existence.

**On manual end turn:**

- Append `turn.ended-manually`.
- Use when a miss/bounce-out is not detected or a reset event is missing.

### 10.4 Per-game considerations

**X01**

- Preserve the beginning-of-turn score.
- Bust restores that score but still counts thrown darts according to Blackbird's statistical rules.
- Double-out and a remaining score of one need the existing logic.
- A winning dart identifies the winner immediately, but final UI transition may wait for removal.

**Cricket**

- Apply marks provisionally so the live display feels immediate.
- Commit the round and increment `rounds` on removal/manual end turn.
- Preserve existing standard, cutthroat, and no-score behavior.
- Dead darts still need to be represented for MPR and replay.

**Baseball**

- The active inning determines the target number.
- Any detected dart outside that number is a zero-run dart but should retain its real location for analytics.
- Commit the inning on removal/manual end turn.

### 10.5 Do not deduplicate by time alone

Two darts can land quickly in the same segment. A rule such as “ignore identical scores within 500 ms” will delete real throws. Deduplication belongs at the transport/event-ID level, not by comparing score and timestamp.

---

## 11. Preparing the two boards

Use the two boards asymmetrically.

### Board A: engineering board

- Used for protocol capture.
- Used for SD-card cloning and custom boot tests.
- May run the custom UI and development services.
- Clearly label the stock SD card and development SD card.

### Board B: stock control

- Keep official firmware and original SD card unchanged.
- Use it to compare protocol, scoring, clarity, removal behavior, boot time, and camera views.
- Do not update it merely to match Board A unless the test plan calls for that firmware.

### Required records

Record for each board:

- Physical serial number.
- `board_serial` from metadata.
- System version.
- Location-engine version.
- Original SD card make, capacity, and checksum image.
- Original firmware version.
- Certificate fingerprint on port 9001.
- Current physical rotation and software rotation index.

---

## 12. Opening the board and cloning the SD card

### 12.1 Physical procedure from Escalade's SD-card guide

The official guide instructs the owner to:

1. Disconnect the power adapter before opening the unit.
2. Remove the eight screws holding the cover/backplate.
3. Lift the backplate carefully because the lower LED wiring remains connected.
4. Disconnect the LED barrel connector.
5. Locate the SD-card access door in the upper-left area of the electronics box.
6. Release the retaining clip and slide the door to expose the card.
7. Reverse the procedure for reassembly.

Treat the electrical warning seriously. Do not open the board while powered. Modification is stated to void the warranty.

### 12.2 Imaging policy

- Never make the first modification on the only original card.
- Image the stock card twice if storage permits.
- Hash both images.
- Test at least one restored clone in Board A before changing files.
- Store one image and the original card offline.

### 12.3 Linux imaging example

First identify the device by size, model, and removable flag:

```sh
lsblk -o NAME,SIZE,MODEL,SERIAL,TRAN,RM,FSTYPE,MOUNTPOINTS
```

Unmount its partitions, replacing `/dev/sdX` only after physically confirming the target:

```sh
sudo umount /dev/sdX1 2>/dev/null || true
sudo umount /dev/sdX2 2>/dev/null || true
```

Read the card into an image:

```sh
sudo dd if=/dev/sdX of=prodigy-board-a-stock.img bs=4M status=progress conv=fsync
sha256sum prodigy-board-a-stock.img > prodigy-board-a-stock.img.sha256
```

Reading uses `if=/dev/sdX`. Reversing `if` and `of` destroys the card or another disk. Confirm the device three times before using `dd`.

### 12.4 macOS imaging example

Identify the card:

```sh
diskutil list external physical
diskutil info /dev/diskN
```

Unmount the whole device:

```sh
diskutil unmountDisk /dev/diskN
```

Read it through the raw device:

```sh
sudo dd if=/dev/rdiskN of=prodigy-board-a-stock.img bs=4m
shasum -a 256 prodigy-board-a-stock.img > prodigy-board-a-stock.img.sha256
```

macOS does not natively mount common Linux ext filesystems. Use a Linux machine or Linux VM for read-only filesystem analysis and modifications.

### 12.5 Restore to a development card

Restoring is destructive. Use a blank card with equal or greater capacity and confirm its device path independently.

```sh
sudo dd if=prodigy-board-a-stock.img of=/dev/sdY bs=4M status=progress conv=fsync
sync
```

Boot Board A from this unmodified clone first. If it fails, the clone or card geometry needs investigation before Blackbird files are added.

---

## 13. Inspecting the SD card without changing it

### 13.1 Attach the image read-only on Linux

```sh
sudo losetup --find --show --partscan --read-only prodigy-board-a-stock.img
```

The command returns a loop device such as `/dev/loop7`. Inspect it:

```sh
lsblk -f /dev/loop7
sudo fdisk -l /dev/loop7
```

Create mount points and mount recognizable Linux filesystems read-only:

```sh
sudo mkdir -p /mnt/prodigy-boot /mnt/prodigy-root /mnt/prodigy-data
sudo mount -o ro /dev/loop7p1 /mnt/prodigy-boot
sudo mount -o ro,noload /dev/loop7p2 /mnt/prodigy-root
```

Partition numbers are examples. Use the actual `lsblk` result.

### 13.2 Inventory commands

```sh
find /mnt/prodigy-root -maxdepth 2 -type d -print | sort
find /mnt/prodigy-root/etc -maxdepth 4 -type f -print | sort
find /mnt/prodigy-root/lib/systemd /mnt/prodigy-root/etc/systemd \
  -type f -print 2>/dev/null | sort
find /mnt/prodigy-root/etc/init.d -type f -print 2>/dev/null | sort
```

Identify executable architecture:

```sh
file /mnt/prodigy-root/sbin/init
find /mnt/prodigy-root -type f -perm -0100 -print0 2>/dev/null \
  | xargs -0 file \
  | grep -E 'ELF .* executable|ELF .* shared object' \
  | head -200
```

Find Qt and Prodigy artifacts:

```sh
find /mnt/prodigy-root -iname '*qt*' -o -iname '*dart*' -o -iname '*prodigy*' \
  2>/dev/null | sort
```

Search boot configuration:

```sh
grep -RInE 'ExecStart|qml|dart|prodigy|location|weston|eglfs|linuxfb|xcb|wayland' \
  /mnt/prodigy-root/etc \
  /mnt/prodigy-root/lib/systemd \
  /mnt/prodigy-root/usr/lib/systemd \
  2>/dev/null
```

### 13.3 Record the filesystem facts

Before designing the installer, answer:

- Which partition contains `/`?
- Is `/` ext4, squashfs, or another format?
- Is a separate data partition mounted under `/data`, `/var`, `/home`, or another location?
- Does `/etc/fstab` mount root or application paths read-only?
- What program does `/sbin/init` link to?
- Which process owns the display?
- Which process listens on port 9001?
- Which service launches the original Qt scorer?
- Which service launches the location engine?
- Which user and group run both processes?

Do not proceed to service replacement until the location engine and UI are positively distinguished.

---

## 14. Discovering the real boot process

### 14.1 If the image uses systemd

Indicators:

- `/sbin/init` links to `systemd`.
- Unit files exist under `/lib/systemd/system`, `/usr/lib/systemd/system`, or `/etc/systemd/system`.

Inspect default targets and enabled links:

```sh
readlink /mnt/prodigy-root/etc/systemd/system/default.target
find /mnt/prodigy-root/etc/systemd/system -type l -ls
```

For every candidate service, capture:

```sh
sed -n '1,240p' /mnt/prodigy-root/path/to/candidate.service
```

You need the original:

- `ExecStart`
- `User` and `Group`
- `WorkingDirectory`
- `Environment` and `EnvironmentFile`
- display dependencies
- restart policy
- order relative to the location engine

### 14.2 If the image uses SysV/BusyBox init

Indicators:

- `/sbin/init` is BusyBox or SysV init.
- `/etc/inittab` exists.
- `/etc/init.d` and `/etc/rc?.d` contain startup scripts.

Inspect:

```sh
sed -n '1,240p' /mnt/prodigy-root/etc/inittab
find /mnt/prodigy-root/etc/rc*.d -type l -ls 2>/dev/null
grep -RInE 'qml|dart|prodigy|location|weston|eglfs|linuxfb|xcb|wayland' \
  /mnt/prodigy-root/etc/init.d \
  /mnt/prodigy-root/etc/rc.local \
  /mnt/prodigy-root/etc/profile* \
  /mnt/prodigy-root/home \
  2>/dev/null
```

### 14.3 Desktop/session autostart possibilities

The vendor UI may be launched outside the init service directly. Inspect:

- `/etc/xdg/autostart`
- display-manager configuration
- Weston startup configuration
- X session scripts
- `/home/root/.profile`
- `/home/root/.xinitrc`
- custom shell wrappers

### 14.4 Live confirmation

If a console or shell is available, record:

```sh
uname -a
cat /etc/os-release
cat /proc/cmdline
mount
df -h
ps wwaux
ss -lntp
systemctl --no-pager --type=service --state=running 2>/dev/null
```

Do not assume a USB keyboard exposes a terminal; the official manual guarantees keyboard/mouse use with the UI, not shell access. If no console is available, the SD image remains the primary discovery mechanism.

---

## 15. Choosing the on-board runtime

### 15.1 Recommended: native Qt/QML application

Why it fits:

- Qt is already part of the board image.
- The original UI is Qt/QML.
- Qt can use the same display stack and WebSocket/TLS libraries.
- QML is suitable for a full-screen ten-foot HDMI interface.
- A C++ backend can handle SQLite, the socket, IPC, and updates.

Build against the exact Qt ABI and target sysroot discovered on the SD card. The public `meta-qt5/sumo` recipe is a starting clue, not a complete SDK.

### 15.2 Possible: static web bundle in an embedded browser

Use only if inspection confirms a sufficiently capable Qt WebEngine/Chromium and hardware acceleration. The current Blackbird Next.js application should not be copied directly to the board and expected to run because:

- Node.js may not be installed.
- The embedded browser may not support modern JavaScript/CSS.
- Root storage and RAM may be limited.
- A cloud page would compromise offline boot.

If the browser is capable, create a separate static on-board UI build with no server dependency and communicate with a localhost daemon.

### 15.3 Possible: a statically linked bridge plus Qt UI

A small Rust, Go, or C++ bridge may be convenient, but verify target architecture, libc, TLS, and available storage. A Qt C++ bridge has the advantage of matching the installed WebSocket stack.

### 15.4 Not recommended initially: full replacement OS

A new OS risks losing:

- proprietary location-engine binaries and licenses
- camera drivers
- sensor input
- LED control
- calibration data
- display configuration
- firmware-specific services

Preserve the vendor OS and replace only the scorer until Blackbird is stable.

---

## 16. Recommended on-board software layout

Do not overwrite vendor binaries. Install Blackbird in a separate namespace:

```text
/opt/blackbird/
  releases/
    1.0.0/
      bin/blackbird-boardd
      bin/blackbird-ui
      qml/
      lib/
      manifest.json
  current -> releases/1.0.0

/etc/blackbird/
  board.json
  cloud.json
  logging.json

/var/lib/blackbird/
  blackbird.sqlite3
  credentials/
    device-token
  state/
  update/

/var/log/blackbird/            # only if persistent logs are appropriate

/boot/BLACKBIRD_FACTORY_UI     # optional physical fallback marker
```

Adapt data paths if root is read-only or `/var` is volatile. Prefer the board's existing persistent data partition.

### Permissions

```text
/opt/blackbird                root:root 0755
/etc/blackbird               root:root 0755
configuration                root:root 0644
/var/lib/blackbird           blackbird:blackbird 0750
device-token                 blackbird:blackbird 0600
database                     blackbird:blackbird 0600
```

Run as a dedicated non-root user when device permissions allow it. If the display or vendor socket requires root in the first prototype, document that as technical debt and reduce privileges after the device nodes and groups are known.

---

## 17. Building the on-board Blackbird UI

### 17.1 Split scoring rules from React

Create a pure package in the Blackbird repository:

```text
packages/scoring-core/
  events.js
  reducer.js
  x01.js
  cricket.js
  baseball.js
  validation.js
  serialization.js
```

No React, DOM, Supabase, clock, random generator, or network calls belong in the reducer.

Required API:

```js
const initial = createGame(config);
const next = applyGameEvent(initial, event);
const snapshot = serializeGame(next);
const restored = deserializeGame(snapshot);
const result = deriveCompletedResult(restored);
```

Use fixtures to prove that the web and board reducers produce identical results.

### 17.2 Qt integration choices

**Choice A: port rules to C++**

- Strong embedded control.
- Duplicates rule implementation unless generated tests are shared.

**Choice B: run compatible JavaScript through Qt's JS engine**

- Reuses the pure rule package.
- Requires transpilation to the JavaScript level supported by the installed Qt.

**Choice C: share JSON test fixtures but maintain two implementations**

- Acceptable if the embedded JS runtime is too old.
- Requires strict cross-implementation conformance tests.

Choice B is preferred if the board's Qt version can run the transpiled reducer reliably.

### 17.3 QML screen set

Minimum local UI:

1. Boot/health screen.
2. Home and game picker.
3. Local player picker.
4. X01 setup and scorer.
5. Cricket setup and scorer.
6. Baseball scorer.
7. Correction/undo overlay.
8. Completed game/result screen.
9. Pairing and network status.
10. Board diagnostics: serial, versions, clarity, storage, pending uploads.
11. Safe fallback/reboot screen.

### 17.4 Display backend

Do not hardcode `QT_QPA_PLATFORM=eglfs`. The real value may be `eglfs`, `linuxfb`, `wayland`, or `xcb`. Copy the vendor UI's working environment and command-line options.

Record and reuse:

- `QT_QPA_PLATFORM`
- `QT_QPA_EGLFS_*` variables
- `DISPLAY`
- `WAYLAND_DISPLAY`
- `XDG_RUNTIME_DIR`
- input-device settings
- application-specific `LD_LIBRARY_PATH`

### 17.5 Local IPC

Prefer a Unix-domain socket such as:

```text
/run/blackbird/boardd.sock
```

Use newline-delimited JSON or a small framed protocol. The UI subscribes to events; the daemon owns the Prodigy connection and SQLite. Restarting the UI must not interrupt event capture.

---

## 18. Booting Blackbird instead of the vendor scorer

The exact unit names below are placeholders. First discover the real services.

### 18.1 Desired dependency order

```text
network and display prerequisites
          |
          v
Prodigy location engine
          |
          v
blackbird-boardd
          |
          v
blackbird-ui
```

### 18.2 Example systemd daemon unit

```ini
[Unit]
Description=Blackbird Prodigy bridge and local event service
After=<PRODIGY_LOCATION_SERVICE> network.target
Requires=<PRODIGY_LOCATION_SERVICE>
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=blackbird
Group=blackbird
WorkingDirectory=/var/lib/blackbird
ExecStart=/opt/blackbird/current/bin/blackbird-boardd --config /etc/blackbird/board.json
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Some old systemd releases do not support every hardening directive. Remove only unsupported options after checking `systemd --version` and logs.

### 18.3 Example systemd UI unit

```ini
[Unit]
Description=Blackbird full-screen dart scoring UI
After=blackbird-boardd.service <DISPLAY_STACK_SERVICE>
Requires=blackbird-boardd.service
Conflicts=<PRODIGY_UI_SERVICE>
ConditionPathExists=!/boot/BLACKBIRD_FACTORY_UI
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
User=<VENDOR_UI_USER>
Group=<VENDOR_UI_GROUP>
WorkingDirectory=/var/lib/blackbird
EnvironmentFile=-/etc/blackbird/display.env
ExecStart=/opt/blackbird/current/bin/blackbird-ui --qml /opt/blackbird/current/qml/main.qml
Restart=on-failure
RestartSec=2

[Install]
WantedBy=<VENDOR_GRAPHICAL_TARGET>
```

The `<...>` fields must come from the original vendor unit. Do not guess them.

### 18.4 Enabling services on an offline development root

On Linux, after mounting the development card read-write at `$TARGET_ROOT`:

```sh
sudo systemctl --root="$TARGET_ROOT" enable blackbird-boardd.service
sudo systemctl --root="$TARGET_ROOT" enable blackbird-ui.service
sudo systemctl --root="$TARGET_ROOT" disable <PRODIGY_UI_SERVICE>
```

Do not disable the location engine. Back up the vendor unit and its enabled symlink state first.

### 18.5 SysV alternative

If the board does not use systemd:

- Add separate `/etc/init.d/blackbird-boardd` and `/etc/init.d/blackbird-ui` scripts.
- Start the daemon after the vendor location engine.
- Start the UI after the display stack.
- Remove only the vendor UI's runlevel link, not its script.
- Add a fallback marker check before starting Blackbird.

Example logic, adapted to the board's existing init-script conventions:

```sh
if [ -e /boot/BLACKBIRD_FACTORY_UI ]; then
  exec /path/to/original/vendor-ui-wrapper
fi

start-stop-daemon --start --background \
  --make-pidfile --pidfile /run/blackbird-ui.pid \
  --exec /opt/blackbird/current/bin/blackbird-ui
```

Use the board's existing helper syntax rather than assuming `start-stop-daemon` is installed.

---

## 19. Fail-safe startup and factory fallback

### 19.1 Physical fallback

The strongest recovery method is a labelled stock SD card. If Blackbird prevents normal boot:

1. Disconnect power.
2. Restore the stock card.
3. Reassemble safely.
4. Boot the vendor environment.

### 19.2 Development-card marker fallback

The Blackbird UI unit can include:

```ini
ConditionPathExists=!/boot/BLACKBIRD_FACTORY_UI
```

If Blackbird fails, mount the development card on Linux and create:

```text
/boot/BLACKBIRD_FACTORY_UI
```

The original vendor UI must still be enabled through a complementary launcher or recovery target. Test the marker before relying on it.

### 19.3 Automatic crash fallback

Recommended policy:

- If `blackbird-boardd` cannot connect to port 9001, keep retrying and show diagnostics.
- If `blackbird-ui` crashes three times in 60 seconds, stop restarting it.
- A recovery service launches the vendor UI or a simple diagnostic screen.
- Never start both scoring UIs as active masters unless testing proves coexistence safe.

### 19.4 Release directories

Deploy versions side by side:

```text
/opt/blackbird/releases/1.0.0
/opt/blackbird/releases/1.0.1
/opt/blackbird/current -> releases/1.0.1
```

Switch the symlink atomically. Retain the previous release until the new version has completed several games and one reboot.

---

## 20. Local SQLite database and outbox

### 20.1 Local-first principle

The board acknowledges a dart to its UI only after the event is safely committed locally. Cloud success is never required to continue a turn.

### 20.2 Suggested SQLite schema

```sql
pragma journal_mode = WAL;
pragma synchronous = FULL;
pragma foreign_keys = ON;
pragma busy_timeout = 5000;

create table if not exists board_config (
  key text primary key,
  value_json text not null,
  updated_at text not null
);

create table if not exists local_players (
  id text primary key,
  display_name text not null,
  cloud_user_id text,
  cloud_player_name text,
  created_at text not null,
  updated_at text not null
);

create table if not exists local_games (
  id text primary key,
  game_type text not null,
  config_json text not null,
  players_json text not null,
  owner_cloud_user_id text,
  status text not null,
  started_at text not null,
  completed_at text,
  winner_json text,
  result_json text,
  last_reduced_seq integer not null default -1,
  cloud_game_id text,
  cloud_finalized_at text
);

create table if not exists board_events (
  id integer primary key autoincrement,
  board_id text not null,
  local_game_id text,
  boot_id text not null,
  seq integer not null,
  event_type text not null,
  payload_json text not null,
  raw_line text,
  observed_at text not null,
  received_monotonic_ms integer not null,
  unique (board_id, boot_id, seq),
  foreign key (local_game_id) references local_games(id)
);

create index if not exists board_events_game_seq_idx
  on board_events(local_game_id, id);

create table if not exists game_snapshots (
  local_game_id text not null,
  through_event_id integer not null,
  state_json text not null,
  created_at text not null,
  primary key (local_game_id, through_event_id),
  foreign key (local_game_id) references local_games(id)
);

create table if not exists outbox (
  event_id integer primary key,
  attempt_count integer not null default 0,
  next_attempt_at text not null,
  last_error text,
  acknowledged_at text,
  foreign key (event_id) references board_events(id)
);
```

### 20.3 Transaction for a new event

```text
BEGIN IMMEDIATE
  insert board_events
  insert outbox
  apply reducer
  update local_games.last_reduced_seq
  optionally insert snapshot
COMMIT
notify UI
```

If the process loses power before commit, the event is not announced. If it loses power after commit, replay restores it.

### 20.4 Snapshot policy

Store a snapshot:

- at game start
- after each committed turn
- after every correction
- at game completion

Raw events remain canonical; snapshots are a performance optimization.

### 20.5 Outbox retry

Suggested retry sequence with jitter:

```text
1 s, 2 s, 5 s, 10 s, 30 s, 1 min, 5 min, 15 min, 1 hour
```

Reset to a short delay after connectivity is restored. Do not retry a permanent authentication failure indefinitely without surfacing “board needs re-pairing.”

---

## 21. Pairing the board to the Blackbird app

### 21.1 Personal two-board enrollment

For your two boards, the simplest secure first implementation is administrator provisioning:

1. Create a board row from a protected Blackbird admin page or CLI.
2. Generate a 256-bit random device token.
3. Store only its hash in Supabase.
4. Put the raw token on that board at `/var/lib/blackbird/credentials/device-token` with mode `0600`.
5. Associate the board with your user account.
6. Give each board a distinct name and ID.

This avoids building a general public enrollment service before the board integration works.

### 21.2 Product-grade pairing flow

Later:

1. The unpaired board registers its public ID and receives a short-lived six-digit code.
2. The board displays the code and a QR code.
3. A signed-in user enters/scans the code in Blackbird.
4. Vercel checks that the code is unused and unexpired.
5. The server sets `owner_user_id` and rotates the device token.
6. The board receives the new token through its already authenticated enrollment session.
7. Both sides show the board serial/name for confirmation.

Pair codes should:

- expire in five to ten minutes
- be single-use
- be rate-limited by board and IP
- be stored as hashes
- never be accepted as permanent credentials

### 21.3 Live game join

When a user opens a paired board in Blackbird:

1. Fetch the board's active `board_game` through RLS.
2. Subscribe to `board-game:<game_uuid>` as a private channel.
3. Load durable events after the last client sequence.
4. Apply missed events.
5. Then accept live Broadcast events.

Always load durable state around a Realtime subscription. Broadcast delivery alone is not a durable replay guarantee.

---

## 22. Vercel ingestion API

### 22.1 Why HTTPS event ingestion is preferred

- The board initiates outbound traffic through ordinary home routers.
- Vercel never needs to reach a private address.
- Each dart payload is tiny.
- Requests are naturally retryable and observable.
- Supabase Realtime already handles app-facing live distribution.
- A function restart does not lose durable state.

### 22.2 Request contract

```http
POST /api/board-events HTTP/1.1
Authorization: Board <random-device-token>
Content-Type: application/json
Idempotency-Key: <board-id>:<boot-id>:<seq>
```

```json
{
  "schema": 1,
  "boardId": "8b31...",
  "localGameId": "f240...",
  "bootId": "c2aa...",
  "seq": 37,
  "observedAt": "2026-08-16T19:22:51.381Z",
  "type": "dart.detected",
  "dart": {
    "n": 20,
    "mult": 3,
    "r": 72.4,
    "theta": 184.5,
    "scoreError": false
  },
  "raw": "Dart: 20,3,72.4,184.5,false"
}
```

### 22.3 Response semantics

```json
{
  "accepted": true,
  "duplicate": false,
  "cloudGameId": "...",
  "serverReceivedAt": "..."
}
```

- `200`: accepted or already accepted; safe to acknowledge locally.
- `400`: invalid schema; hold and surface a software/protocol error.
- `401`: missing/invalid device token; stop fast retries and request pairing.
- `403`: revoked board or mismatched board ID.
- `409`: use only if the body conflicts with an existing idempotency key; do not use for an identical duplicate.
- `429`: retain and retry using `Retry-After`.
- `5xx`: retain and retry with backoff.

### 22.4 Next.js route skeleton

The current project uses the App Router, so the endpoint can live at `app/api/board-events/route.js`.

```js
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function tokenHash(token) {
  return createHash("sha256")
    .update(`${process.env.BOARD_TOKEN_PEPPER}:${token}`)
    .digest("hex");
}

function parseBoardAuthorization(request) {
  const value = request.headers.get("authorization") || "";
  if (!value.startsWith("Board ")) return null;
  return value.slice("Board ".length).trim();
}

function validateEvent(body) {
  if (body?.schema !== 1) throw new Error("unsupported-schema");
  if (typeof body.boardId !== "string") throw new Error("board-id");
  if (typeof body.bootId !== "string") throw new Error("boot-id");
  if (body.localGameId != null && typeof body.localGameId !== "string") {
    throw new Error("local-game-id");
  }
  if (!Number.isSafeInteger(body.seq) || body.seq < 0) throw new Error("seq");
  if (typeof body.type !== "string") throw new Error("type");
  return body;
}

export async function POST(request) {
  const token = parseBoardAuthorization(request);
  if (!token || token.length < 32) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let event;
  try {
    event = validateEvent(await request.json());
  } catch (error) {
    return Response.json({ error: String(error.message || error) }, { status: 400 });
  }

  const hash = tokenHash(token);

  const { data: credential, error: credentialError } = await admin
    .from("board_credentials")
    .select("board_id, revoked_at")
    .eq("board_id", event.boardId)
    .eq("token_hash", hash)
    .maybeSingle();

  if (credentialError || !credential || credential.revoked_at) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: board, error: boardError } = await admin
    .from("dartboards")
    .select("id, owner_user_id, status")
    .eq("id", event.boardId)
    .maybeSingle();

  if (boardError || !board || board.status !== "active") {
    return Response.json({ error: "board-disabled" }, { status: 403 });
  }

  let boardGameId = null;

  if (event.localGameId) {
    const { data: existingGame, error: gameLookupError } = await admin
      .from("board_games")
      .select("id")
      .eq("board_id", event.boardId)
      .eq("local_game_id", event.localGameId)
      .maybeSingle();

    if (gameLookupError) {
      return Response.json({ error: "game-lookup-failed" }, { status: 500 });
    }

    if (existingGame) {
      boardGameId = existingGame.id;
    } else if (event.type === "game.started") {
      const { data: createdGame, error: gameCreateError } = await admin
        .from("board_games")
        .insert({
          board_id: event.boardId,
          local_game_id: event.localGameId,
          owner_user_id: board.owner_user_id,
          game_type: event.game?.gameType,
          config: event.game?.config || {},
          players: event.game?.players || [],
          started_at: event.observedAt
        })
        .select("id")
        .single();

      if (gameCreateError) {
        return Response.json({ error: "game-create-failed" }, { status: 500 });
      }

      boardGameId = createdGame.id;
    } else {
      // The board must upload game.started before later game events.
      return Response.json({ error: "game-not-registered" }, { status: 409 });
    }
  }

  const row = {
    board_game_id: boardGameId,
    board_id: event.boardId,
    local_game_id: event.localGameId,
    boot_id: event.bootId,
    seq: event.seq,
    event_type: event.type,
    payload: event,
    occurred_at: event.observedAt
  };

  const { data, error } = await admin
    .from("dart_events")
    .upsert(row, {
      onConflict: "board_id,boot_id,seq",
      ignoreDuplicates: true
    })
    .select("id, board_game_id, received_at");

  if (error) {
    console.error("board event insert failed", {
      boardId: event.boardId,
      bootId: event.bootId,
      seq: event.seq,
      code: error.code
    });
    return Response.json({ error: "ingest-failed" }, { status: 500 });
  }

  await admin
    .from("dartboards")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", event.boardId);

  return Response.json({
    accepted: true,
    duplicate: !data?.length,
    serverReceivedAt: data?.[0]?.received_at || new Date().toISOString()
  });
}
```

Production refinements:

- Enforce a small request size at the edge/firewall.
- Allow-list event types and validate dart ranges.
- Compare the `Idempotency-Key` header to the body tuple.
- Do not log the Authorization header or raw token.
- Rate-limit by board ID.
- Map `localGameId` to a canonical cloud game inside one transaction/RPC.
- Return stable errors that the board can classify.
- Add request correlation IDs.

### 22.5 Vercel environment variables

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
BOARD_TOKEN_PEPPER
```

Use a current `sb_secret_...` key where compatible. The legacy service-role key remains supported during migration, but both are server-only and bypass RLS. Never prefix either with `NEXT_PUBLIC_`.

The browser should use a Supabase publishable key rather than a server secret.

---

## 23. Supabase schema and RLS design

### 23.1 Why the existing RLS is insufficient

The current schema allows any authenticated member broad access to shared players/results. That may be acceptable for the existing friends league, but board credentials, precise dart events, active sessions, and pairing records need ownership-based authorization.

### 23.2 Proposed migration

This is a design baseline. Run it first in a staging project, inspect grants/Data API exposure, run Supabase advisors, and generate a real migration through the current Supabase CLI workflow.

```sql
create table if not exists public.dartboards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  serial_hash text not null unique,
  display_name text not null,
  firmware_version text,
  location_engine_version text,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'retired')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_credentials (
  board_id uuid primary key references public.dartboards(id) on delete cascade,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.board_games (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.dartboards(id) on delete restrict,
  local_game_id uuid not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  game_type text not null,
  config jsonb not null default '{}'::jsonb,
  players jsonb not null default '[]'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned')),
  winner jsonb,
  result jsonb,
  started_at timestamptz not null,
  completed_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, local_game_id)
);

create index if not exists board_games_owner_started_idx
  on public.board_games(owner_user_id, started_at desc);

create index if not exists board_games_board_status_idx
  on public.board_games(board_id, status);

create table if not exists public.dart_events (
  id bigint generated by default as identity primary key,
  board_game_id uuid references public.board_games(id) on delete cascade,
  board_id uuid not null references public.dartboards(id) on delete restrict,
  local_game_id uuid,
  boot_id uuid not null,
  seq bigint not null check (seq >= 0),
  event_type text not null,
  payload jsonb not null,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  unique (board_id, boot_id, seq)
);

create index if not exists dart_events_game_id_idx
  on public.dart_events(board_game_id, id);

create index if not exists dart_events_board_received_idx
  on public.dart_events(board_id, received_at desc);

alter table public.dartboards enable row level security;
alter table public.board_credentials enable row level security;
alter table public.board_games enable row level security;
alter table public.dart_events enable row level security;

revoke all on public.board_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.board_credentials to service_role;

grant select, update on public.dartboards to authenticated;
grant select on public.board_games to authenticated;
grant select on public.dart_events to authenticated;

create policy "owners read their boards"
  on public.dartboards
  for select
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy "owners update their boards"
  on public.dartboards
  for update
  to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create policy "owners read their board games"
  on public.board_games
  for select
  to authenticated
  using ((select auth.uid()) = owner_user_id);

create policy "owners read their dart events"
  on public.dart_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.board_games g
      where g.id = dart_events.board_game_id
        and g.owner_user_id = (select auth.uid())
    )
  );
```

### 23.3 Important Supabase 2026 considerations

- New SQL-created tables may not be exposed automatically to the Data API, depending on project settings. Grants and RLS are separate layers; verify both.
- Enable RLS on every table in an exposed schema.
- The `realtime` schema is locked against arbitrary object changes, but RLS policies on `realtime.messages` remain supported.
- Do not use `user_metadata` for authorization. It is user-editable. Use table ownership, `auth.uid()`, or controlled app metadata.
- `TO authenticated` alone is authentication, not row ownership. Always include an ownership predicate.
- A server secret/service-role client bypasses RLS; every Vercel route using it must perform its own authorization checks.
- Supabase JS dropped Node.js 20 support in 2026. Use Node.js 22 or later for upgraded clients and pin the tested package version exactly rather than leaving an unconstrained caret.

### 23.4 Transactional game finalization

Do not let the board or browser directly perform several result and Elo updates. A server-side transaction should:

1. Lock or check the `board_games` row.
2. Return the existing result if `finalized_at` is already set.
3. Replay or validate the event-derived final state.
4. Insert one `game_results` row per player.
5. Update Elo.
6. Set `finalized_at` and store the canonical result.
7. Commit atomically.

The function may be a carefully protected database function in an unexposed schema or a direct Postgres transaction from a server connection. Do not expose a privileged `SECURITY DEFINER` function in `public` with default execute grants.

---

## 24. Supabase Realtime delivery

### 24.1 Durable database first, Broadcast second

Realtime is the low-latency notification path. `dart_events` is the durable recovery path.

Recommended ordering:

1. Vercel authenticates the board.
2. Postgres accepts the idempotent event.
3. A database trigger broadcasts the committed event privately.
4. Clients receive the event.
5. A reconnecting client queries events after its last durable sequence.

### 24.2 Private topic

```text
board-game:<cloud-game-uuid>
```

### 24.3 Broadcast trigger

Create helper objects outside the locked `realtime` schema:

```sql
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.broadcast_dart_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.board_game_id is not null then
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'boardGameId', new.board_game_id,
        'boardId', new.board_id,
        'bootId', new.boot_id,
        'seq', new.seq,
        'type', new.event_type,
        'payload', new.payload,
        'receivedAt', new.received_at
      ),
      'dart-event',
      'board-game:' || new.board_game_id::text,
      true
    );
  end if;
  return new;
end;
$$;

revoke all on function private.broadcast_dart_event() from public, anon, authenticated;

drop trigger if exists dart_events_broadcast_after_insert
  on public.dart_events;

create trigger dart_events_broadcast_after_insert
after insert on public.dart_events
for each row execute function private.broadcast_dart_event();
```

### 24.4 Realtime authorization policy

```sql
create policy "owners receive board game broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.board_games g
    where ('board-game:' || g.id::text) = (select realtime.topic())
      and g.owner_user_id = (select auth.uid())
  )
);
```

The Blackbird web client only needs receive access if all board events originate through Vercel. Do not grant authenticated users direct Broadcast insert unless a separate remote-control feature requires it.

Disable “Allow public access” in Realtime Settings when enforcing private channels.

### 24.5 Client subscription

```js
const topic = `board-game:${boardGameId}`;

const channel = supabase.channel(topic, {
  config: {
    private: true,
    broadcast: { self: false }
  }
});

channel
  .on("broadcast", { event: "dart-event" }, ({ payload }) => {
    applyRemoteBoardEvent(payload);
  })
  .subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await loadDurableEventsAfter(lastSeenEventId);
    }
  });
```

Handle the subscribe/query race by deduplicating on durable event ID and `(boardId, bootId, seq)`.

---

## 25. Refactoring the Blackbird scoring engines

### 25.1 New shared event types

```js
export const GameEvent = {
  DART: "game.dart",
  REMOVE_DARTS: "game.remove-darts",
  CORRECT_DART: "game.correct-dart",
  VOID_DART: "game.void-dart",
  END_TURN: "game.end-turn",
  UNDO: "game.undo",
  ABANDON: "game.abandon"
};
```

### 25.2 Input adapters

```js
export function fromManualDart(dart) {
  return { type: "game.dart", source: "manual", dart };
}

export function fromProdigyEvent(event) {
  if (event.type === "dart.detected") {
    return {
      type: "game.dart",
      source: "prodigy",
      hardwareEventId: `${event.boardId}:${event.bootId}:${event.seq}`,
      dart: event.dart
    };
  }

  if (event.type === "darts.removed") {
    return {
      type: "game.remove-darts",
      source: "prodigy",
      hardwareEventId: `${event.boardId}:${event.bootId}:${event.seq}`
    };
  }

  return null;
}
```

### 25.3 Component changes

`PlayX01`, `PlayCricket`, and `PlayBaseball` should receive:

```js
{
  game,
  snapshot,
  dispatch,
  inputMode,
  boardStatus,
  onFinish,
  onQuit
}
```

Manual buttons call `dispatch(fromManualDart(...))`. Hardware subscription calls `dispatch(fromProdigyEvent(...))`. The component never calls a private `addDart` function containing the only copy of the rules.

### 25.4 Browser recovery

Persist active cloud-game identity and last durable event ID. On page refresh:

1. Fetch `board_games` and its latest snapshot/result.
2. Fetch durable events after the snapshot.
3. Replay them.
4. Subscribe to Realtime.
5. Resolve race duplicates.

This also fixes the current limitation where a phone refresh loses a live game.

---

## 26. Game finalization, Elo, and analytics

### 26.1 Idempotent result key

Use the canonical `board_games.id` as the finalization key and add a unique constraint preventing duplicate result rows for the same game/player:

```sql
create unique index if not exists game_results_game_username_unique
  on public.game_results(game_id, username);
```

Verify existing data has no duplicates before creating the index.

### 26.2 Result derivation

The server should not blindly trust a board-supplied winner if the event log is sufficient to derive it. Options:

- Replay the pure scoring reducer server-side.
- Compare the board's result with a server replay and quarantine mismatches.
- Initially accept the board result but store a reducer version and checksum for later audit.

Recommended fields:

```json
{
  "scoringCoreVersion": "2.0.0",
  "eventCount": 52,
  "lastEventKey": "board:boot:seq",
  "stateHash": "sha256:...",
  "correctionCount": 1,
  "autoDetectedDarts": 49,
  "manualDarts": 3
}
```

### 26.3 New analytics enabled by hardware

- Heat map by player and segment.
- Radial and angular grouping.
- Automatic-score correction rate.
- Clarity versus error rate.
- First/second/third dart accuracy.
- Checkout route adherence.
- Miss/bounce-out frequency.
- Time between darts and visits.
- Board/firmware comparison.

Keep raw position data ownership-restricted; publish only aggregates where broader league visibility is intended.

---

## 27. Security model

### 27.1 Trust boundaries

```text
Untrusted LAN
  |-- phone/browser
  |-- other local devices
  |-- board network interface

Board local trusted boundary
  |-- location engine
  |-- Blackbird daemon
  |-- local SQLite/token

Cloud trusted backend
  |-- Vercel server route
  |-- Supabase secret key
  |-- Postgres
```

### 27.2 Device credential rules

- Generate at least 256 random bits.
- Store the raw token only on the board.
- Store only a salted/peppered hash in the database.
- Send only over HTTPS.
- Never place it in a query string.
- Never log it.
- Support rotation and revocation.
- Use a separate token for each board.
- File mode `0600`.

### 27.3 Supabase key rules

- Browser: publishable key plus the signed-in user's JWT and RLS.
- Vercel: secret key, server-only.
- Board: no Supabase secret key and preferably no Supabase publishable key; it talks only to the narrow Vercel device API.

### 27.4 LAN socket rules

- Connect to loopback on the board.
- Do not proxy arbitrary commands from the internet to port 9001.
- Maintain an allow-list of safe commands.
- Separate “read board data” from “change calibration/network settings.”
- Require physical/admin confirmation for brightness, sensitivity, rotation, Wi-Fi, update, and reset operations.

### 27.5 Update security

- Sign Blackbird update manifests.
- Verify hash and signature before extraction.
- Extract to a new version directory.
- Reject path traversal and symlinks escaping the release directory.
- Atomically move the `current` link only after verification.
- Keep a previous known-good release.

### 27.6 Privacy and claims

- Do not use Supabase `user_metadata` to authorize board ownership.
- Do not automatically assign old unclaimed games without confirmation.
- Do not expose board serials or raw position events through the existing public TV cast.
- Treat a public/publishable key as public; RLS is the protection.

---

## 28. Networking modes

### 28.1 Wired Ethernet

Preferred for the installed board:

- Stable cloud synchronization.
- No Wi-Fi mode switching.
- Easier diagnostics.
- Board and phone may remain on the same LAN.

### 28.2 Wi-Fi client mode

The board joins the home network. This supports cloud sync and LAN access. The official manual instructs the phone and board to join the same network for the original app.

### 28.3 Board access-point mode

The phone joins the board's own network. The manual states the board cannot be access point and Wi-Fi client simultaneously. Unless Ethernet is also independently usable in that mode, cloud sync may be unavailable.

Blackbird policy:

- Local play always works.
- Queue cloud events in access-point/offline mode.
- Show “local only; N events pending.”
- Upload after Ethernet or Wi-Fi client connectivity returns.

### 28.4 mDNS

Use `_dartboard._tcp` only for companion discovery. The on-board scorer should use `127.0.0.1`. Blackbird may advertise a separate service such as `_blackbird-darts._tcp` for diagnostics, but it should expose no unauthenticated control commands.

---

## 29. Installation procedure on the development SD card

This procedure begins only after the service names, architecture, root filesystem, display environment, and persistent data path are known.

### Step 1: restore a fresh development clone

Use a clone of the stock image, not the original card.

### Step 2: mount it read-write on Linux

```sh
sudo losetup --find --show --partscan /path/to/development-card-device-or-image
sudo mount /dev/loopXpN /mnt/prodigy-root
```

Use the actual loop device and root partition.

### Step 3: back up boot artifacts inside the working directory

Record copies and checksums of:

- original UI unit/script
- location-engine unit/script
- display/compositor unit
- environment file
- target/runlevel symlinks
- application configuration
- `/etc/fstab`

### Step 4: create Blackbird directories and user

Use the target image's supported account-management mechanism. On a static Yocto image, editing `/etc/passwd`, `/etc/group`, and `/etc/shadow` may be appropriate only after matching its conventions. For the first lab build, reusing the vendor UI account may be safer than inventing an invalid account entry.

### Step 5: copy a target-architecture release

```text
/opt/blackbird/releases/<version>
```

Validate every binary with host `file` and target dependency inspection:

```sh
file /mnt/prodigy-root/opt/blackbird/releases/1.0.0/bin/*
readelf -d /mnt/prodigy-root/opt/blackbird/releases/1.0.0/bin/blackbird-ui
```

### Step 6: create configuration

Example `/etc/blackbird/board.json`:

```json
{
  "schema": 1,
  "boardId": "generated-board-uuid",
  "prodigy": {
    "host": "127.0.0.1",
    "port": 9001,
    "tls": {
      "mode": "pinned",
      "sha256Fingerprint": "REPLACE_AFTER_CAPTURE"
    }
  },
  "storage": {
    "database": "/var/lib/blackbird/blackbird.sqlite3"
  },
  "cloud": {
    "baseUrl": "https://YOUR-BLACKBIRD-DOMAIN",
    "enabled": true
  }
}
```

### Step 7: install Blackbird services

- Install units/scripts.
- Enable daemon and UI.
- Disable only the vendor UI.
- Leave location engine and display stack enabled.
- Add/test fallback path.

### Step 8: flush, unmount, and inspect

```sh
sync
sudo umount /mnt/prodigy-root
sudo losetup -d /dev/loopX
```

### Step 9: first boot with HDMI and keyboard

Expected sequence:

1. Normal boot graphics/logs.
2. Location engine becomes available.
3. Blackbird diagnostic/boot screen.
4. Metadata displays system and LE versions.
5. Blackbird home screen appears.

If the screen remains blank, stop after a short observation period, power off, and inspect logs from the SD card. Do not repeatedly power-cycle without collecting evidence.

### Step 10: perform a no-dart smoke test

- UI navigation.
- Local database creation.
- Network status.
- Board metadata.
- Clarity display.
- Reboot and state restoration.

Only then throw darts.

---

## 30. Calibration and protocol test matrix

### 30.1 Read-only logger first

Before Blackbird controls a game, run a logger that:

- connects
- sends only read-only metadata requests
- timestamps every raw line
- never sends correction, reset, Wi-Fi, rotation, brightness, or sensitivity commands

### 30.2 Segment coverage

Throw controlled darts at:

- Singles 1 through 20.
- Doubles 1 through 20.
- Triples 1 through 20.
- Outer bull.
- Inner bull.
- Intentional miss outside the board.
- Bounce-out.
- Robin hood if safely reproducible.
- Two darts very close together.
- Three darts in one segment.

For a practical first pass, use representative numbers from each quadrant, then complete full coverage after parsing is proven.

### 30.3 Removal behavior

Test:

- Remove one dart before the visit is complete.
- Remove all three together.
- Remove darts slowly one by one.
- Touch a dart without removing it.
- Correct a dart before removal.
- Reinsert a removed dart.
- Start the next visit immediately after removal.

Record the exact `Reset:` timing and whether `Clarity` changes first.

### 30.4 False triggers

Without damaging the installation, observe expected behavior around:

- nearby footsteps
- closing a door
- touching the surround
- adjusting the board

Do not hammer or strike the wall for testing. The goal is to understand ordinary environmental false positives.

### 30.5 Rotation and clarity

- Record metadata before physical rotation.
- Use the vendor procedure to rotate and update the software index.
- Record metadata after.
- Verify score mapping in multiple rotation positions.
- Introduce only safe, reversible background obstructions to observe clarity values.

### 30.6 Protocol compatibility record

For each test run, store:

```text
board serial
system version
location engine version
client/bridge version
certificate fingerprint
test case
raw input lines
normalized events
expected score
actual score
correction required
```

---

## 31. Functional and failure testing

### 31.1 Local game tests

- X01 straight out.
- X01 double out.
- Bust below zero.
- Double-out leaving one.
- Winning double on first, second, and third dart.
- Cricket standard close/score behavior.
- Cricket cutthroat point assignment.
- Cricket no-score winner.
- Cricket dead darts and MPR.
- Baseball target/non-target hits.
- Baseball tie and extra inning.
- Correction at every dart position.
- Undo before and after removal.

### 31.2 Power-loss tests

At controlled points, remove power using the normal switch where possible:

- Before a game.
- After game creation.
- After first dart.
- After third dart but before removal.
- After removal.
- During an outbox upload.
- After local completion but before cloud finalization.

Expected result: no duplicate event, no corrupt database, and deterministic resume or explicit recovery choice.

### 31.3 Network tests

- Ethernet unplugged during a visit.
- Wi-Fi lost for one minute.
- DNS failure.
- Vercel returns 500.
- Vercel returns 429.
- Supabase unavailable.
- Invalid/revoked token.
- Network restored with 1, 100, and 10,000 queued events.

### 31.4 Realtime tests

- App joins before game starts.
- App joins mid-turn.
- App sleeps and reconnects.
- App misses several events.
- Multiple authorized viewers.
- Unauthorized user guesses a game UUID.
- Duplicate Broadcast plus durable query race.

### 31.5 Firmware tests

Before applying any Prodigy update:

1. Restore/use stock SD.
2. Record versions and behavior.
3. Apply the official update according to official instructions.
4. Re-run the read-only protocol suite.
5. Compare messages and certificate.
6. Mark the Blackbird bridge compatible only after passing.

---

## 32. Operations, diagnostics, and recovery

### 32.1 On-screen status

Always show small but visible indicators for:

- location engine connected/disconnected
- camera clarity
- network connected/offline
- paired/unpaired
- pending upload count
- cloud authentication failure
- storage low

Local play should remain available for cloud-only failures.

### 32.2 Health record

Periodically record or upload:

```json
{
  "boardId": "...",
  "systemVersion": "...",
  "locationEngineVersion": "...",
  "blackbirdVersion": "...",
  "uptimeSeconds": 12345,
  "locationEngineConnected": true,
  "clarity": 98,
  "dartsInView": 0,
  "diskFreeBytes": 123456789,
  "pendingOutbox": 0,
  "lastCloudAckAt": "..."
}
```

Do not upload raw logs continuously unless needed; embedded storage and privacy matter.

### 32.3 Log rotation

- Prefer system journal if persistent limits are configured.
- Otherwise cap files by size and count.
- Avoid logging every raw event indefinitely in text because the SQLite event record already exists.
- Redact tokens and Authorization headers.

### 32.4 Common failure guide

**Black screen, board otherwise alive**

- Verify vendor display environment copied correctly.
- Inspect Qt platform-plugin errors.
- Restore vendor UI marker or stock SD.

**Blackbird UI opens but says location engine disconnected**

- Confirm vendor location service is running.
- Confirm port 9001 listener.
- Confirm loopback TLS/certificate handling.
- Compare service startup order.

**Darts appear twice**

- Ensure only one bridge owns event publication.
- Verify the UI is not subscribed twice.
- Deduplicate by event key, not score/time.

**Turn never advances**

- Inspect raw `Reset:` message.
- Check whether darts remain visible.
- Offer manual end-turn.
- Inspect clarity/background.

**Wrong segment after board rotation**

- Compare physical white-dot position and software rotation index.
- Do not compensate in Blackbird until vendor mapping is verified.

**Games play locally but do not sync**

- Check pending outbox.
- Check device token status.
- Check system clock and HTTPS certificate validation.
- Check Vercel request logs by board ID/correlation ID.
- Check Data API grants and server secret configuration.

**Cloud shows duplicates**

- Verify unique `(board_id, boot_id, seq)`.
- Verify unique game/player result constraint.
- Verify finalization checks `finalized_at` transactionally.

---

## 33. Updates and version management

### 33.1 Version matrix

Maintain:

| Blackbird board build | Prodigy system | LE version | Protocol tests | Status |
|---|---:|---:|---|---|
| 1.0.0 | 1.2.8 | TBD | baseline suite | pending physical test |

### 33.2 Blackbird update bundle

Manifest example:

```json
{
  "schema": 1,
  "version": "1.0.1",
  "targetArchitecture": "REPLACE_FROM_SD_INSPECTION",
  "minimumSystemVersion": "1.2.0",
  "filesSha256": {
    "bin/blackbird-boardd": "...",
    "bin/blackbird-ui": "..."
  },
  "bundleSha256": "...",
  "signature": "..."
}
```

### 33.3 Update procedure

1. Download to a temporary file.
2. Verify TLS.
3. Verify signed manifest and bundle hash.
4. Confirm architecture and free space.
5. Extract to a new release directory.
6. Verify individual file hashes.
7. Run a no-display self-test where possible.
8. Atomically switch `current`.
9. Restart Blackbird services.
10. Roll back automatically if health does not become ready.

### 33.4 Do not couple vendor and Blackbird updates

An official Prodigy firmware update can alter the protocol or location engine. Apply it on the stock/control path first and certify it before updating the custom board.

---

## 34. Delivery phases and estimates

### Phase 0: preservation and inventory — 1 to 2 days

- Record both boards.
- Clone and hash SD cards.
- Prove a restored clone boots.
- Identify architecture, init system, units, display environment, and persistent storage.

Exit criterion: exact vendor UI and location-engine services identified; stock recovery tested.

### Phase 1: read-only protocol logger — 1 to 3 days

- Connect to port 9001.
- Parse line framing.
- Capture metadata, darts, removal, clarity, misses, and errors.
- Build firmware compatibility fixture set.

Exit criterion: controlled throw matrix produces correct normalized events.

### Phase 2: Blackbird scoring-core refactor — 3 to 7 days

- Extract pure reducer.
- Adapt manual web UI.
- Add hardware adapter.
- Create replay fixtures.
- Make active web games recoverable.

Exit criterion: existing manual behavior is unchanged and hardware event fixtures produce identical scores.

### Phase 3: local board daemon and SQLite — 4 to 8 days

- Local protocol connection.
- SQLite event log/outbox.
- IPC.
- Resume and correction.
- Board status.

Exit criterion: command-line or simple UI completes offline games and survives restart.

### Phase 4: on-board Qt/QML interface — 1 to 3 weeks

- Full-screen game UI.
- HDMI/input integration.
- Boot service.
- Diagnostics and fallback.
- Local player/game management.

Exit criterion: Board A boots into Blackbird and completes all games without phone/internet.

### Phase 5: Vercel/Supabase sync — 4 to 8 days

- Board credentials.
- Ingestion route.
- Schema/RLS.
- Private Realtime.
- Idempotent finalization and Elo.
- App pairing and live view.

Exit criterion: offline game later uploads exactly once and appears in analytics.

### Phase 6: hardening — 1 to 2 weeks

- Power/network failure suite.
- Certificate pinning.
- Signed updates.
- Long-duration tests.
- Board B comparison.
- Documentation and recovery drill.

---

## 35. Acceptance criteria

### Boot and recovery

- Board A boots Blackbird automatically ten consecutive times.
- Location engine remains operational.
- Vendor UI or stock SD can be restored without data loss.
- Blackbird UI crash does not destroy local game data.

### Local scoring

- X01, Cricket, and Baseball finish with no app/internet.
- Every legal segment maps correctly.
- Removal advances the visit.
- Manual correction and end-turn work.
- Restart restores an interrupted game deterministically.

### Cloud sync

- Paired board uploads while app is closed.
- Offline backlog uploads after reconnect.
- Replaying the same request creates no duplicate.
- Completed game creates one result row per player.
- Elo changes exactly once.

### Authorization

- An unrelated authenticated user cannot read a board, game, raw dart events, or private channel.
- The board contains no Supabase secret/service-role key.
- Revoking a board token stops new ingestion without breaking local play.
- Public TV casting reveals only intended derived scoreboard state.

### Maintenance

- Clarity warnings are visible.
- Firmware/LE/Blackbird versions are visible.
- Pending upload count is visible.
- Signed Blackbird update can roll back.

---

## 36. Unknowns that must be resolved from the real SD card

The following cannot be responsibly specified from public manuals alone:

1. CPU architecture and instruction set.
2. Exact Qt version and ABI.
3. Whether Qt WebSockets and SQLite development/runtime modules are available to a new binary.
4. Init system and exact service names.
5. Vendor UI executable, wrapper, and working directory.
6. Location-engine executable and service.
7. Display backend and required environment.
8. Root filesystem writability.
9. Persistent data partition and available space.
10. Existing database format and whether it needs to remain enabled.
11. Console/SSH/serial access options.
12. Device-node permissions required by the UI.
13. Exact miss/bounce-out event representation.
14. Meaning and units of radius/angle fields.
15. Exact certificate lifecycle across boards and firmware.
16. Whether multiple port-9001 clients can coexist without state conflict.
17. Whether stopping the vendor UI affects location-engine cleanup or watchdog behavior.
18. Whether a hardware watchdog expects the original process name/heartbeat.
19. Whether the board root image verifies files or has secure-boot/integrity checks.
20. Behavior of vendor correction/reset commands.

The next concrete engineering artifact should be either:

- A read-only SD-card image from Board A, or
- A filesystem inventory containing partition data, unit/init files, executable metadata, mounts, and process/listener output.

Once that exists, replace every `<PLACEHOLDER>` in Sections 18 and 29 with the actual boot configuration and create an installation package specific to the board.

---

## 37. Source register

### Escalade/Prodigy official sources

1. **Prodigy support page** — official links for the D9000W manual, firmware, apps, tech guides, and SD-card access:  
   <https://www.escaladesports.com/pages/prodigy-support>

2. **D9000W Assembly and Operation Manual, 2L-7934-01** — HDMI/USB operation, networking modes, game controls, edit behavior, rotation, maintenance, live camera views, vibration troubleshooting, and warranty:  
   <https://cdn.shopify.com/s/files/1/0489/1505/4757/files/Prodigy_Electronic_Dartboard_Assembly_Operation_-_2L-7934-01.pdf?v=1642436909>

3. **Accessing the SD card** — physical SD-card access, power warning, modification/warranty warning, and Qt `meta-qt5/sumo` recipe:  
   <https://escalade-shopify-assets.s3.amazonaws.com/prodigy/accessing-the-sd-card.pdf>

4. **Firmware Update Instructions** — USB-copy procedure and required filename behavior:  
   <https://escalade-shopify-assets.s3.amazonaws.com/prodigy/Firmware-Instructions-V2.pdf>

5. **Prodigy Darts Technology** — cameras, infrared lighting, location algorithms, automatic removal progression, and integrated connectivity:  
   <https://www.escaladesports.com/pages/prodigy-darts-technology>

6. **Dartboard scoring-system patent publication and granted patent family** — two-camera capture, angle calculation, triangulation, sensor triggering, and scoring:  
   <https://patents.google.com/patent/US20170307341A1/en>

7. **Qt meta-qt5 sumo branch identified by Escalade**:  
   <https://github.com/meta-qt5/meta-qt5/tree/sumo>

### Supabase official sources

8. **Supabase changelog** — current breaking changes, including locked Realtime schema, Data API exposure changes, and Node.js client support:  
   <https://supabase.com/changelog>

9. **Realtime Broadcast** — client, REST, and database Broadcast behavior and private topics:  
   <https://supabase.com/docs/guides/realtime/broadcast>

10. **Realtime Authorization** — private channels and RLS on `realtime.messages`:  
    <https://supabase.com/docs/guides/realtime/authorization>

11. **Securing the Data API** — grants, RLS, exposed schemas, and privileged-code considerations:  
    <https://supabase.com/docs/guides/api/securing-your-api>

12. **Understanding Supabase API keys** — publishable, secret, legacy anon, and service-role behavior:  
    <https://supabase.com/docs/guides/getting-started/api-keys>

13. **Realtime pricing** — current message and peak-connection quotas:  
    <https://supabase.com/docs/guides/realtime/pricing>

### Vercel official sources

14. **Vercel Functions** — current server-side execution model:  
    <https://vercel.com/docs/functions>

15. **Vercel Function limits** — duration and runtime limits that make short event requests preferable to using a cloud function as the permanent board bridge:  
    <https://vercel.com/docs/functions/limitations>

16. **Vercel WebSockets** — current WebSocket support and reconnect/external-state considerations:  
    <https://vercel.com/docs/functions/websockets>

### Project evidence

The Blackbird findings in this guide come from the user-supplied `blackbird-main.zip`, especially:

- `ARCHITECTURE.md`
- `lib/darts.js`
- `lib/db.js`
- `lib/cast.js`
- `components/PlayX01.js`
- `components/PlayCricket.js`
- `components/PlayBaseball.js`
- `supabase/schema.sql`
- `package.json`

The Prodigy protocol section is based on static interoperability inspection of the current Prodigy Android client and must be treated as an undocumented, firmware-sensitive interface rather than an official vendor API.

---

## Final implementation recommendation

Build the project in this order:

1. Clone and inspect Board A's SD card.
2. Identify the vendor UI and location-engine boot services.
3. Prove read-only port-9001 event capture.
4. Extract Blackbird's scoring rules into a deterministic shared reducer.
5. Build the local SQLite-backed board daemon.
6. Build the Qt/QML HDMI interface.
7. Enable it on a cloned development SD while retaining factory fallback.
8. Add Vercel ingestion and ownership-based Supabase storage.
9. Add private Realtime and app pairing.
10. Certify power loss, offline backlog, correction, idempotency, and recovery.

That produces the behavior you asked for: **turn on the Prodigy and Blackbird is already there; play complete games locally; connect the app whenever convenient; and have every game logged exactly once.**
