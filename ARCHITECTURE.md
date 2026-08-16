# Blackbird — Architecture

How the app works, start to finish. This is the technical companion to
[README.md](README.md) (setup/deploy) and [ROADMAP.md](ROADMAP.md) (future
work). Accurate as of v1.3.

---

## 1. Context

Blackbird is a private dart-scoring web app for a league of friends. One
person scores each game on a phone; everyone's stats, Elo ratings, and
history live in a shared Postgres database and are visible to the whole
group instantly. Over time it has grown live TV scoreboards, per-round
cricket MPR analytics, an AI insights tab, seasonal easter eggs, and an
experimental theming system.

Guiding constraints that explain most design decisions:

- **Tiny team, zero ops.** Everything runs on two managed services (Vercel +
  Supabase). No servers to patch, no queues, no cron.
- **Phones first.** Scoring happens standing at a dartboard. Big targets,
  little typing, works as an add-to-home-screen web app.
- **Postgres is the single source of truth.** No game data in localStorage;
  the only client-side persistence is the Supabase session token and one TV
  display preference.
- **Schema-light.** Per-game statistics are JSONB blobs, so new games and new
  metrics ship without SQL migrations.
- **No emojis in the UI.** All iconography is flat, single-color inline SVG
  (`currentColor` / theme tokens).

## 2. System topology

```
┌────────────────────────────────────────────────────────────┐
│ Clients                                                    │
│  • Phones (primary scoring UI, add-to-home-screen)         │
│  • Tablets / desktops (same app, wider layout)             │
│  • TVs (/tv page: smart-TV browser, AirPlayed window,      │
│    or Chromecast tab — read-only live scoreboard)          │
└──────────────────────────┬─────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼─────────────────────────────────┐
│ Vercel — Next.js 14 (App Router)                           │
│                                                            │
│  app/page.js            the entire interactive app (client)│
│  app/tv/page.js         TV scoreboard (client, no auth)    │
│  app/api/insights/route.js   server-only: AI provider call │
│  app/api/admin/route.js      server-only: service-role ops │
│                                                            │
│  Static assets, CSS, fonts served from the same deploy.    │
│  Every push to main auto-deploys production.               │
└──────────────────────────┬─────────────────────────────────┘
                           │ supabase-js v2 (anon key)
┌──────────────────────────▼─────────────────────────────────┐
│ Supabase                                                   │
│  • Auth: email/password; user prefs in user_metadata       │
│  • Postgres: players, game_results, matches (legacy)       │
│    guarded by Row Level Security                           │
│  • Realtime: broadcast channels for phone→TV casting       │
│    (no tables involved, transient messages only)           │
└────────────────────────────────────────────────────────────┘
```

Two API routes exist **only** to keep secrets off the client: the AI
provider key (`/api/insights`) and the Supabase `service_role` key
(`/api/admin`). Everything else — scoring, stats, Elo, casting — runs in
the browser against Supabase with the public anon key + RLS.

## 3. Repository layout

```
app/
  layout.js               root layout, metadata, viewport
  page.js                 THE app: splash gate, auth gate, view router,
                          live-game state, TV-cast publisher
  globals.css             the entire design system (tokens, components,
                          themes, skins, TV styles, seasonal effects)
  tv/page.js              TV scoreboard page (standalone, no auth)
  api/insights/route.js   AI call (verifies Supabase JWT first)
  api/admin/route.js      admin ops via service role (verifies admin email)
components/
  Auth.js                 sign in / sign up
  Home.js                 dashboard: stat tiles, games/week chart, top 5
  Setup.js                game type + options + player picker
  PlayX01.js              X01 engine + UI (per-dart entry)
  PlayCricket.js          cricket engine + UI (marks, MPR, variants)
  PlayBaseball.js         baseball engine + UI (9 innings + extras)
  Leaderboard.js          standings by Elo / X01 avg / cricket MPR
  Profile.js              player page: trend charts, per-game history
  PlayerCard.js           canvas-rendered shareable stat card (PNG export)
  Matchup.js              Elo win-probability + head-to-head
  Insights.js             AI Q&A over pre-aggregated league stats
  Account.js              display name, theme, accent, text size
  Admin.js                user management, resets, theme lab
  LoadingScreen.js        splash: wordmark + dartboard spinner + occasions
  Charts.js               dependency-free SVG LineChart + BarChart
  DartBoard.js            SVG dartboard (highlights + hit markers)
  ui.js                   shared bits: icons (flat SVG), BackBar, Modal…
  tv/TVScoreboard.js      big-screen cricket/X01/baseball views
lib/
  supabase.js             client factory (null when unconfigured)
  db.js                   data access: players + game_results
  stats.js                Elo math, career stats, timelines, H2H, replay
  cast.js                 TV-cast transport (Realtime + local test mode)
  darts.js                shared dart/mark formatting
  skins.js                experimental skin registry + applier
  occasions.js            date-triggered splash flourishes
  prefs.js                font-scale preference
  constants.js            targets, cricket values, Elo K, accents…
supabase/
  schema.sql              run once: tables + RLS policies
docs/screenshots/         README images
```

There are **four JS dependencies**: `next`, `react`, `react-dom`,
`@supabase/supabase-js`. Charts, dartboard, confetti, snow, casting — all
hand-rolled. This is deliberate: no supply-chain surface, no bundle bloat.

## 4. Boot sequence (what happens when you open the app)

1. **Static HTML arrives** from Vercel (the page is client-rendered; the
   prerendered shell shows the splash).
2. **Splash** (`LoadingScreen`): Blackbird wordmark + one-color 8-section
   dartboard spinner. `page.js` starts a timer of `1000 + rand(0..2000)` ms;
   the splash is held until BOTH the timer elapses and auth resolves, so
   every launch has 1–3 s of branded "perceived loading" even when cached.
   After mount the splash checks `lib/occasions.js` — Sep 11 adds confetti
   + a party hat on the wordmark; any December day adds falling snow;
   `?occasion=birthday|snow` previews them (effects render post-mount so
   prerendered HTML stays date-independent; hidden under reduced-motion).
3. **Config gate**: if `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` are missing,
   a "Setup needed" card renders instead (the supabase client is `null`).
4. **Auth resolution**: `supabase.auth.getSession()` reads the persisted
   session from localStorage (no network on the happy path). No session →
   `Auth.js` (sign in / sign up).
5. **Preference application** (effect on `session`): reads
   `user.user_metadata` and applies
   - `theme` → `data-theme` attribute (`light` default / `dark` / `glass`)
   - `accent` → inline `--accent` CSS var (skipped when a skin is active)
   - `fontScale` → `--fs` and `--fs-chrome` vars (content vs chrome scaling)
   - `skin` → `data-skin` attribute (admin theme lab, §11)
6. **Data load**: `getPlayers()` + `getGameResults()` in parallel — the app
   loads **all** result rows and derives everything client-side (§7). The
   splash shows "loading…" until both resolve. A visibility-change listener
   refetches when the app regains focus; the header has a manual refresh.
7. **Self-registration**: if the signed-in display name isn't in the shared
   `players` table yet, it is inserted, so every account automatically
   appears in everyone's opponent picker.
8. **Render**: view state machine in `page.js` (`home`, `setup`, `playX01`,
   `playCricket`, `playBaseball`, `leaderboard`, `profile`, `matchup`,
   `insights`, `account`, `admin`) — plain `useState`, no router; the whole
   app is one URL.

## 5. Identity & authorization model

- **Login accounts** (Supabase Auth) and **players** (rows in `players`)
  are distinct: a player is just a name that appears in games; an account
  gets linked to a player by its `display_name`. Guests can be added as
  players without accounts (optionally `hidden` from standings).
- **Per-user preferences** live in `user_metadata` (theme, accent,
  fontScale, display_name, experimental `skin`) — updated via
  `supabase.auth.updateUser`, no custom tables.
- **RLS posture** (see `supabase/schema.sql`): any *authenticated* account
  may read and insert players/game_results and update players (needed for
  Elo write-back). Nothing is deletable or rewritable via the anon key —
  destructive operations exist only behind `/api/admin`.
- **Admin** = the single email in `ADMIN_EMAIL` (checked client-side for UI
  and re-verified server-side in `/api/admin`, which is the only holder of
  the service-role key). Admin can manage accounts, delete/hide players,
  reset scores, and use the theme lab.
- The **TV page requires no login**: it only listens to broadcast state
  keyed by a room code (§9's threat model: worst case, a guessed code sees
  a scoreboard).

## 6. Data model

Three tables (full DDL in `supabase/schema.sql`):

- **`players`** — `username` (unique), `hidden`, `elo` (current rating,
  default 1000), `created_at`.
- **`game_results`** — **one row per player per finished game**:
  `game_id` (uuid shared by the rows of one game), `username`, `game_type`,
  `config` (jsonb), `winner`, `result` ('win'/'loss'), `opponents` (jsonb
  array), `stats` (jsonb, per-player performance), `elo_after`,
  `completed_at`.
- **`matches`** — legacy one-row-per-game table; kept only for the admin
  "rebuild from old games" migration (`stats.js: replayMatchesToResults`).
  New games never write to it.

`stats` JSONB shapes by game type:

| Game | Stats blob |
|------|-----------|
| x01 | `dartsThrown`, `pointsScored`, `highestTurn`, `checkout`, `finalScore`, `darts[]` (every dart as `{n, mult}`), `dartPos[3]` (per-position sum/count) |
| cricket | `marks`, `rounds`, `roundMarks[]` (marks per round), `mpr`, `pointsScored`, `darts[]` |
| baseball | `runs`, `darts[]` |

Because `stats` is free-form JSONB, **adding a stat or a whole game type
requires no migration** — old rows simply lack the new keys and the readers
tolerate that (e.g. cricket games recorded before per-round tracking have
totals but no `roundMarks`).

## 7. Read path: aggregation at read time

There are no aggregate tables, no materialized views, no cron. On every
load the client pulls all `game_results` rows and derives:

- **`computeStats(results)`** (`lib/stats.js`) → per-player career stats:
  overall W/L and win %, X01 3-dart average (points/darts×3), per-dart-
  position averages, highest turn, best leg, highest checkout; cricket
  career MPR (total marks ÷ total rounds — a properly weighted average),
  best single-game MPR, points; baseball run averages.
- **`playerTimeline(results, user)`** → chronological series for the
  profile charts: Elo after each game, cumulative win %, X01 average per
  game, cricket MPR per game (works retroactively from stored
  `marks`/`rounds`).
- **`headToHead(results, a, b)`** → record between two players, computed
  from A's own rows (stays correct even if an opponent was reset).
- **Home dashboard** buckets unique games (dedup by `game_id`) into 13
  seven-day windows for the games-per-week bar chart.

Tradeoff: O(all rows) on every load. For a friends league (thousands of
rows at most) this is milliseconds and keeps the write path trivially
simple. If the app ever hosted many leagues, this is the first thing to
revisit (see ROADMAP #30).

## 8. Write path: the game engine

### The contract

Every game type plugs into the same pipeline:

```
Setup.js            builds  game = { id, gameType, players[], config }
page.js             holds it in state; renders the matching Play component
Play*.js            receives { game, resume, onProgress, onFinish, onQuit,
                               castActive }
  onProgress(state)   fired on EVERY state change (entire state as JSON)
  onFinish(match)     match = { id, gameType, config, players, winner,
                                perPlayer, completedAt }
page.js.finishMatch  computes Elo, writes rows, refreshes, resets view
```

- `onProgress` feeds two consumers: a `useRef` (`liveProgress`) used to
  **resume** the live game if the user navigates away and back, and the
  **TV-cast publisher** (§9). It is an in-memory checkpoint only — a page
  reload loses the live game (ROADMAP #24).
- **Solo games are practice**: `finishMatch` skips persistence for fewer
  than 2 players.
- All three engines share an **undo pattern**: a `history` array of
  deep-cloned state snapshots per committed turn; undo pops the current
  uncommitted dart first, then restores the last snapshot.

### X01 (`PlayX01.js`)

Per-dart entry (`{n, mult}`, bull = `{25,2}`, miss = `{0,0}`). Each dart
recomputes remaining: `<0` busts the turn (score restored, darts still
counted, position averages count zeros); `0` wins if straight-out or the
last dart was a double (double-out), else bust; `1` remaining under
double-out busts; 3 darts commit normally. Winner's `checkout` is the score
they stood on. Per-position sums power the 1st/2nd/3rd-dart averages.

### Cricket (`PlayCricket.js`)

Targets 20…15 + Bull; ring selector (single/double/triple, bull max
double) then target; up to 3 darts per turn, committed by "End turn".
Variants: **standard** (close + lead on points), **cutthroat** (points are
given to open opponents; lowest wins), **no-score** (first to close all).

**MPR uses the standard league rule**: darts that advance closing a number
always count; hits beyond a close count only while at least one opponent
still has the number open (i.e. while they can score); dead darts count 0.
Each turn's effective marks are appended to `roundMarks`, so every game
stores its round-by-round history; live MPR (`markCount / rounds`) renders
in the scoreboard during play and on the TV.

### Baseball (`PlayBaseball.js`)

9 innings, target number = inning (continuing 10…20 for extras). Four
buttons (single/double/triple/miss); runs = multipliers on the target.
After inning 9, a unique leader ends the game, otherwise extra innings.

## 9. TV cast mode

Design goal: the classic pub-TV scoreboard — game huge on the TV, phone
reduced to big entry buttons — with **no native app and no login on the
TV**.

### Transport (`lib/cast.js`)

One interface, two implementations:

- **Supabase Realtime broadcast** (production): channel `cast:<CODE>`,
  where CODE is 4 characters from an ambiguity-free alphabet
  (`ACDEFHJKMNPRTWXY34679`). Broadcast is transient pub/sub — no tables,
  no rows, no auth required.
- **`window.BroadcastChannel`** (tests/dev, enabled by `?localcast=1` or
  `NEXT_PUBLIC_CAST_TRANSPORT=local`): same-browser transport so the
  Playwright harness can drive a phone page and a TV page against a mocked
  Supabase with full fidelity.

Events:

| Event | Direction | Meaning |
|-------|-----------|---------|
| `state` | phone → TVs | `{game, snapshot}` on every scoring change (throttled ~200 ms, undo `history` stripped — it grows unboundedly) |
| `finished` | phone → TVs | winner screen |
| `ended` | phone → TVs | game quit, cast still active → TV waits for next game |
| `stopped` | phone → TVs | casting stopped → TVs drop to code entry |
| `hello` | TV → phone | sent once the TV's channel is actually SUBSCRIBED (an `onReady` callback avoids the race where the reply beats the join); the phone answers with the current snapshot, or `ended` if nothing is live — this is how late joiners sync |

### Lifecycle

Phone: "Cast to TV" (flat vector icon) on any live game → generates code,
opens channel, shows code chip; publisher hooks the existing `onProgress`
feed in `page.js.saveProgress`. The code persists across games until Stop.
`finishMatch`/`quit` clear any queued throttle timer *before* emitting
`finished`/`ended` so a stale `state` can never overwrite the winner
screen. While casting, play components receive `castActive` and collapse
their scoreboard + dartboard into entry-only UI (X01 keeps a compact
"remaining" readout).

TV (`app/tv/page.js`): state machine `enter-code → waiting → live →
finished → …`. Forced dark theme. Wrong/typo'd codes are surfaced by an
8-second no-answer timeout ("no phone answered — check the code") instead
of waiting forever. Multiple TVs can join one code (broadcast fan-out).

### Display

`components/tv/TVScoreboard.js` renders per-game big views as **pure
functions of the broadcast snapshot** (no local game logic): cricket marks
grid + points + live MPR + round, giant X01 remaining + averages, baseball
box score — alongside the same `DartBoard` SVG the phone uses, with the
thrower's open numbers outlined and the turn's darts plotted. A footer
toggle ("hide board" / "show board", persisted per TV in localStorage)
switches to a score-only layout with extra-large type. Typography is
viewport-scaled (`clamp`/vw) and independent of the phone's font-scale
preference.

## 10. Elo

`applyEloUpdate` (`lib/stats.js`): K=24, base 1000. The winner is updated
pairwise against each loser (`expected = 1/(1+10^((Rl−Rw)/400))`); losers
move only versus the winner, not each other. Each result row stores
`elo_after` for the timeline; current ratings live on `players.elo`. The
Matchup tab converts a rating gap to a win probability with the same
logistic. The admin "rebuild" action can replay legacy `matches`
chronologically to regenerate rows and ratings.

## 11. Presentation system

Everything visual flows from CSS custom properties in `globals.css`:

- **Tokens**: `--bg/--surface/--ink/--muted/--line/--accent/--red/--amber`,
  radii, shadow, font stacks.
- **Themes** (user-selectable in Account): `light` (default), `dark`,
  `glass` (translucent iOS-style) via `data-theme`; accent color and text
  scale (`--fs` for content, gentler `--fs-chrome` for shell) are
  per-account too.
- **Skins** (admin theme lab, `lib/skins.js` + `data-skin`): experimental
  full-app looks — Anduril (near-black squared monochrome console), Airbnb
  (white/coral, pill buttons, gradient CTA), Uber (black-and-white
  Helvetica utility). A skin owns the complete palette + geometry, beats
  the theme (equal specificity, later in the file), and releases the
  inline accent override. Stored only in the picking account's
  `user_metadata.skin`; selection reloads the page.
- **Responsive**: one codebase, three classes — phones (base), ≥900 px
  (wider container, two-column profile charts, centered nav), TV (`.tv`
  scope, vw-scaled).
- **Iconography**: inline single-color SVGs (`GearIcon`, `CastIcon`, back
  chevron, dartboard spinner, party hat) — never emojis.
- **Charts** (`Charts.js`): dependency-free SVG line/bar charts sharing one
  axis style; percent axes clamp to 0–100.

## 12. Server routes

### `/api/insights` (POST)

The only AI touchpoint. The client pre-aggregates a compact league summary
(never raw rows), sends `{kind: league|player|matchup|custom, summary,
question?}` with the caller's Supabase access token. The route verifies the
token server-side, builds a prompt, and dispatches on `AI_PROVIDER`:
Gemini (default) / Groq / OpenAI / Anthropic, each with a default model
and key from non-public env vars. Response: `{text, model}`.

### `/api/admin` (POST)

Requires a valid session token AND the caller's email to equal
`ADMIN_EMAIL`; only then uses `SUPABASE_SERVICE_ROLE_KEY` (which bypasses
RLS) for account listing/updating/deleting, player delete/hide, score
resets, and the legacy-match rebuild.

## 13. Build, deploy, environments

- `git push` to `main` → Vercel builds (`next build`) and deploys
  production; other branches get preview URLs automatically.
- Runtime configuration is entirely env vars (see README table):
  Supabase URL/anon key (public), AI provider/key/model and service-role
  key (server-only). No `.env` in the repo.
- The Supabase schema is applied once by pasting `supabase/schema.sql`
  into the SQL editor; day-to-day feature work needs no DB changes thanks
  to the JSONB stats design.

## 14. Testing & verification approach

There is no committed test suite; the app is verified per-change with a
Playwright harness (kept outside the repo) that:

- runs the production build locally against a **mocked Supabase** —
  network interception serves canned auth/players/game_results responses,
  and a forged localStorage session skips login;
- drives real flows (score cricket turns, cast to a TV page over the
  `BroadcastChannel` transport, join by code, toggle display styles) and
  asserts on-screen values (e.g. live MPR arithmetic);
- captures the phone/tablet/TV screenshots used in the README.

The only path this can't exercise is production Supabase Realtime
websockets — that gets a manual smoke test after deploy.

## 15. Known limitations (accepted tradeoffs)

- Live game state is in-memory: a phone reload mid-game loses the leg
  (ROADMAP #24 would persist it and harden TV reconnects).
- Full-table reads on load (fine at league scale; see §7).
- One leg per match; double-out is trusted, not verified.
- Cast codes are 4 characters and channels are public: a guessed code can
  watch a scoreboard (read-only, no data access) — acceptable here.
- `public/` assets referenced by the layout (manifest, icons, logo.png)
  don't exist yet, so Android install prompts don't fire (ROADMAP #25).
- Multiplayer Elo updates winner-pairwise only.

## 16. How to extend

- **New game type**: build `PlayNewGame.js` honoring the §8 contract, add
  the option in `Setup.js`, register the view in `page.js` (three
  touchpoints), add a stats bucket in `lib/stats.js`, and optionally a
  `TVScoreboard` view. No DB work.
- **New skin**: add an entry in `lib/skins.js` and a `[data-skin="x"]`
  block at the end of `globals.css`. Pure CSS.
- **New seasonal occasion**: one date check in `lib/occasions.js`, one
  particle layer/CSS block in `LoadingScreen.js`/`globals.css`.
- **Bigger items**: see [ROADMAP.md](ROADMAP.md).
- **Hardware (Prodigy D9000W)**: the plan to run Blackbird on the
  auto-scoring board itself — local-first SQLite event log, device-token
  ingestion via Vercel, private Realtime — is specified in
  [docs/prodigy-development-guide.md](docs/prodigy-development-guide.md).
  Its Phase 2 (extracting the scoring rules into a pure event-sourced
  reducer) is a pure-software refactor of §8 that also fixes the
  reload-loses-game limitation.
