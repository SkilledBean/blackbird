# Blackbird — Improvement Roadmap + TV Scoreboard Mode

## Context

Blackbird (Next.js 14 + Supabase on Vercel) now has X01/Cricket/Baseball scoring, MPR tracking with per-round history, Elo, profiles/charts, AI insights, a branded splash, and a home activity chart. The user wants (a) a long-form roadmap of further improvements — games, analytics, features — and (b) a "cast to TV" experience: game details displayed large on a TV while the phone keeps a simplified scoring UI.

Key architectural facts that shape everything below:
- Every play component already fires `onProgress(<entire game state as JSON>)` on each change — a ready-made live feed for a TV view.
- `game_results.stats` is free-form JSONB per player per game, so new games and new metrics need **no SQL migrations**.
- New game types plug in via a small contract: Setup builds `{id, gameType, players, config}`; the play component calls `onFinish({id, gameType, config, players, winner, perPlayer, completedAt})`; `lib/stats.js` needs a bucket per game type.
- `@supabase/supabase-js` v2 is installed → Realtime broadcast channels available with no new dependencies.

---

## Part 1 — TV Scoreboard Mode ("cast to TV")

### The honest AirPlay story
A web app cannot natively drive AirPlay with a different UI than the phone (AirPlay mirroring would just clone the phone screen). The standard solution — used by dart apps like DartConnect — is a **TV web page**: any browser on the TV opens the app's `/tv` page, pairs with a room code, and renders a big live scoreboard synced in real time. The phone keeps scoring with its own (simplified) UI. This achieves exactly the requested split-experience and needs no native app.

Per the user, all three setups must work (they all do, since it's just a URL):
- **Apple TV / AirPlay**: AirPlay a Mac Safari window showing `/tv`, or mirror an iPad parked on the TV. (Direct iPhone mirroring is the fallback — it clones the phone UI, still usable.)
- **Smart TV browser**: open the Vercel URL + `/tv` in the TV's built-in browser; the pairing code keeps typing to 4 characters.
- **Chromecast tab-cast**: cast a Chrome tab showing `/tv` from any laptop.
The `/tv` page will show these three one-line instructions on its idle screen.

### Architecture

**Sync mechanism — Supabase Realtime broadcast channels** (already available: `@supabase/supabase-js` v2 is installed; no new dependencies, no schema changes, no table writes).
- The phone is the publisher. `page.js`'s `saveProgress` callback already receives the **entire live game state on every change** from all three play components — hook the broadcast there, throttled (~200 ms), with the unbounded `history` array stripped from the payload.
- Channel name: `cast:<CODE>` where CODE is a 4-character room code (unambiguous alphabet, e.g. `ACDEFHJKMNPRTWXY34679`) generated on the phone.
- Message events: `state` (game meta + snapshot), `finished` (winner), `ended` (quit). The TV sends `hello` when it subscribes; the phone answers with the current snapshot from its `liveProgress` ref — this solves late joins/reconnects since broadcast is transient.
- Security posture: public broadcast channel keyed by the room code. Worst case someone guessing a code sees a live scoreboard — acceptable for a friends-league app, and the TV never gets write access to anything. The TV page therefore **does not require sign-in**.

**Transport abstraction for testability — `lib/cast.js` (~80 lines)**
- `createCastPublisher(code)` → `{send(event, payload), close()}` and `createCastSubscriber(code, handlers)` → `{close()}`.
- Two transports behind the same interface: Supabase Realtime (production) and the browser `BroadcastChannel` API (used when a `NEXT_PUBLIC_CAST_TRANSPORT=local` env or `?local=1` flag is set) — this lets the existing Playwright + mock-Supabase harness test phone↔TV sync in one browser with two pages, since real Realtime websockets can't connect to the mocked backend.
- Handles `supabase === null`, resubscribe on disconnect, and cleanup.

**Pairing UX**
- Phone: a "Cast" button rendered by `page.js` above the live game (visible on all three play views), using a **flat single-color vector TV/cast SVG icon** in the same style as the existing `GearIcon` in `components/ui.js` — **no emojis anywhere in the UI** (this is a standing design rule for all roadmap items: icons are inline single-color SVG shapes using `currentColor`, like the gear and back-chevron already in `ui.js` and the one-color dartboard splash spinner). Tapping Cast generates the code and shows it as a chip ("TV code: ABCD"); tap again to stop casting. Code persists for the session so reconnects rejoin.
- TV: `/tv` idle screen shows the Blackbird wordmark, a large 4-character code input (plain text input — TV browsers pop their own keyboards), and the three one-line setup instructions (AirPlay / smart TV browser / tab-cast). Enter code → waiting screen → live scoreboard as soon as a `state` event arrives.

**Routing & components**
- `app/tv/page.js` (~120 lines) — standalone `"use client"` page, no auth gate, no app shell/nav; connection state machine: `enter-code → waiting → live → winner/ended`.
- `components/tv/TVScoreboard.js` (~250 lines total incl. per-game views) — dispatches on `gameType`:
  - **Cricket**: full-width marks grid (reuse the `cricket-table` markup/symbols from PlayCricket), points, **live MPR**, round number, current player highlighted, last turn's darts.
  - **X01**: giant remaining score per player (vw-based typography), whose throw, darts this turn, live 3-dart average, last turn score.
  - **Baseball**: the box score table writ large, current inning/target.
- `app/globals.css` — a `.tv` scope (~100 lines): vw-based type sizes, dark-leaning default, high-contrast; independent of the phone `--fs` preference.
- Winner screen: big winner name + final stats; `ended` → back to idle with the same code active.

**Simplified phone UI while casting**
- Play components get a `castActive` prop: when true, the scoreboard table and DartBoard collapse (the TV is now the scoreboard) leaving big entry controls — ring selector, target chips, End turn/Undo. ~20 lines per play component, purely conditional rendering; scoring logic untouched.

**Edge cases**: hide the Cast button when `supabase` is null; close channels on quit/finish/unmount; multiple TVs on one code just work (broadcast fan-out); phone page refresh still loses the live game (existing app limitation — roadmap item #24 fixes it and would make TV reconnects bulletproof).

**Scope estimate**: ~550–650 new lines. No SQL, no new dependencies.

**Files to touch**: `lib/cast.js` (new), `app/tv/page.js` (new), `components/tv/TVScoreboard.js` (new), `app/page.js` (cast state + button + publisher hookup in `saveProgress`), `components/PlayCricket.js` / `PlayX01.js` / `PlayBaseball.js` (`castActive` collapse), `app/globals.css` (`.tv` styles), README + screenshots.

---

## Part 2 — Roadmap of further improvements

**Standing design rule (applies to everything below): no emojis in the UI.** All iconography is flat, single-color inline SVG shapes (`currentColor` / theme tokens), matching the existing `GearIcon`, back chevron, and one-color dartboard spinner. Items below that mention avatars/celebrations/icons follow this rule.

### A. New games (each ~1 play component + Setup option + stats bucket)
1. **Around the Clock** — hit 1→20→Bull in order; stats: darts taken, hit rate.
2. **Killer** — each player owns a number, build to killer, knock others out.
3. **Shanghai** — 7 rounds on 1–7 (or 20s down), single+double+triple in one turn = instant "Shanghai" win.
4. **Halve-It** — hit the round's target or your score halves; great party game.
5. **Gotcha / exact-score race** — race to exact total; landing on someone's score resets them.
6. **Tic-Tac-Toe darts** — 3×3 grid of targets, close a square by hitting it; team-friendly.
7. **Legs/Sets for X01** — best-of-N legs, sets, alternating bull-off for the start; brings league-format matches (currently one leg per match).
8. **Doubles/Teams support** — 2v2 with combined team stats (schema: `players` stays individuals; `config.teams` array).

### B. Analytics & stats
9. **Checkout suggestions in X01** — show the standard out-chart path (e.g. 170 → T20 T20 Bull) when remaining ≤ 170; pure lookup table, huge quality-of-life.
10. **Checkout success rate** — attempts vs hits on doubles (needs per-dart intent or infer from remaining ≤ 50 + double-out).
11. **First-9-darts average** (X01) — standard pro metric, computable from existing `dartPos`/log data retroactively.
12. **Heatmap of hits** — aggregate `darts` logs onto the DartBoard SVG per player (already stores every dart's `{n, mult}`).
13. **Cricket number strengths** — MPR per target (20s vs 19s vs bull) from cricket dart logs.
14. **Streaks & records board** — win streaks, best MPR game, highest checkout, most 180s; a "Records" tab or Home section.
15. **Per-session summaries** — group games by night; "Tuesday league night: 9 games, Matt +32 Elo".
16. **Elo history & rankings movement** — arrows on the leaderboard (▲2 this week), already have per-game `elo_after`.
17. **Form indicator** — last-5-games W/L dots next to names on the leaderboard.
18. **CSV/JSON export** — download your `game_results` from the Account screen.

### C. Live-game experience
19. **TV scoreboard mode** (Part 1).
20. **180 / high-score celebrations** — full-screen flash + optional sound on 180s, checkouts, closing cricket.
21. **Sounds & haptics** — dart thock, bust buzz; `navigator.vibrate` on phones; per-user toggle in Account.
22. **Voice caller** — Web Speech API announces "Scores 140!" like a match caller; works well with the TV mode.
23. **Turn timer** (optional) — shot clock for league nights.
24. **Resume across reload** — persist `liveProgress` to localStorage/Supabase so a page refresh doesn't lose the live game (today it's a `useRef` only).

### D. Product/platform
25. **PWA completion** — the manifest/icons referenced in `app/layout.js` don't exist (`public/` is missing): add `public/manifest.webmanifest` + icons + `logo.png` so Android install works; optional service worker for offline shell.
26. **Season support** — season start/end dates; leaderboards and stats filterable per season; archive winners.
27. **Tournaments** — bracket generator from the player list, auto-advance winners, bracket view on the TV mode.
28. **Player avatars** — a per-player accent color plus a flat single-color vector mark (initials in a circle, or a small pick-list of simple SVG shapes); stored in a JSONB `meta` column on `players`. No emojis.
29. **Notifications** — "Sam just beat your best MPR" via web push (needs service worker from #25).
30. **Multi-league support** — `leagues` table + membership; RLS scoping per league (bigger lift; only if the app grows beyond one friend group).
31. **Match photos/notes** — attach a note or photo to a game night (Supabase Storage).
32. **Undo/edit past games (admin)** — admin route already exists; add "delete/fix a game_result" action with Elo replay (replay logic exists in `stats.js: replayMatchesToResults`).

### E. AI insights upgrades
33. **Post-game AI recap** — one-tap "summarize tonight" using existing insights route.
34. **Coaching tips** — feed per-target cricket accuracy + checkout rates for personalized practice suggestions.
35. **Trash talk generator** — pre-match hype line for the TV screen before a game starts (fits TV mode idle screen).

### Suggested build order (rough)
Per the user, this is a **planning document only for now** — nothing gets built until they pick items from it. Recommended sequence when they do:
1. TV scoreboard mode (Part 1) — the headline feature.
2. Checkout suggestions (#9) + celebrations (#20) — big fun-per-line-of-code.
3. PWA completion (#25) — small, fixes real gaps.
4. X01 legs/sets (#7) + first-9 average (#11).
5. Records board (#14) + leaderboard form dots (#17).
6. New games starting with Around the Clock (#1) and Shanghai (#3).

---

## Verification (for the TV mode, when built)

1. **Automated (existing harness)**: extend the Playwright + mock-Supabase scripts in the session scratchpad — launch two pages in one browser context with the `BroadcastChannel` local transport: page A signs in, starts a cricket game, taps Cast, reads the code; page B opens `/tv`, enters the code; assert the TV shows the players, then throw turns on A and assert marks/MPR/round update on B; finish the game and assert the winner screen. Screenshot the TV views at 1920×1080 for the README.
2. **Real-transport smoke test**: after deploy, open the production `/tv` on a laptop and the app on a phone, pair, and play a few turns over actual Supabase Realtime (checks the prod websocket path the local transport can't).
3. **Regression**: run the existing verify scripts (home, profile, cricket flow) to confirm the `castActive` prop changes nothing when casting is off; `npm run build` must stay clean.
