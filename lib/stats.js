import { X01_TARGETS, BASE_ELO, ELO_K } from "./constants";

/**
 * Apply one game's Elo change to a ratings map and return a NEW map.
 * Winner is updated pairwise against each loser (losers move only vs winner).
 * Pure: does not mutate the input.
 */
export function applyEloUpdate(current, players, winner, k = ELO_K, base = BASE_ELO) {
  const R = { ...current };
  const ensure = (u) => {
    if (R[u] == null) R[u] = base;
  };
  ensure(winner);
  players.forEach(ensure);
  for (const l of players) {
    if (l === winner) continue;
    const expW = 1 / (1 + Math.pow(10, (R[l] - R[winner]) / 400));
    R[winner] += k * (1 - expW);
    R[l] -= k * (1 - expW);
  }
  return R;
}

/** Build a {username: elo} map straight from the players table rows. */
export function eloMapFromPlayers(players) {
  const m = {};
  for (const p of players) m[p.username] = p.elo == null ? BASE_ELO : p.elo;
  return m;
}

/**
 * Aggregate per-player stats from game_results rows.
 */
export function computeStats(results) {
  const s = {};
  const init = () => ({
    games: 0,
    wins: 0,
    x01: { games: 0, wins: 0, darts: 0, points: 0, highestTurn: 0, bestLeg: null, highestCheckout: 0, dartPos: [{ sum: 0, count: 0 }, { sum: 0, count: 0 }, { sum: 0, count: 0 }] },
    cricket: { games: 0, wins: 0, marks: 0, rounds: 0, points: 0, bestMpr: 0 },
    baseball: { games: 0, wins: 0, runs: 0 },
  });

  for (const r of results) {
    const u = r.username;
    if (!s[u]) s[u] = init();
    const won = r.result === "win";
    s[u].games++;
    if (won) s[u].wins++;
    const pp = r.stats || {};

    if (r.gameType === "x01") {
      const x = s[u].x01;
      x.games++;
      if (won) x.wins++;
      x.darts += pp.dartsThrown || 0;
      x.points += pp.pointsScored || 0;
      x.highestTurn = Math.max(x.highestTurn, pp.highestTurn || 0);
      if (Array.isArray(pp.dartPos)) {
        for (let i = 0; i < 3; i++) {
          if (pp.dartPos[i]) {
            x.dartPos[i].sum += pp.dartPos[i].sum || 0;
            x.dartPos[i].count += pp.dartPos[i].count || 0;
          }
        }
      }
      if (won) {
        if (x.bestLeg == null || (pp.dartsThrown || 999) < x.bestLeg) x.bestLeg = pp.dartsThrown;
        x.highestCheckout = Math.max(x.highestCheckout, pp.checkout || 0);
      }
    } else if (r.gameType === "cricket") {
      const c = s[u].cricket;
      c.games++;
      if (won) c.wins++;
      c.marks += pp.marks || 0;
      c.rounds += pp.rounds || 0;
      c.points += pp.pointsScored || 0;
      if (pp.rounds) c.bestMpr = Math.max(c.bestMpr, (pp.marks || 0) / pp.rounds);
    } else if (r.gameType === "baseball") {
      const b = s[u].baseball;
      b.games++;
      if (won) b.wins++;
      b.runs += pp.runs || 0;
    }
  }

  for (const u in s) {
    const p = s[u];
    p.winPct = p.games ? (p.wins / p.games) * 100 : 0;
    p.x01.threeDartAvg = p.x01.darts ? (p.x01.points / p.x01.darts) * 3 : 0;
    p.x01.dartAvg = p.x01.dartPos.map((d) => (d.count ? d.sum / d.count : 0));
    p.x01.winPct = p.x01.games ? (p.x01.wins / p.x01.games) * 100 : 0;
    p.cricket.mpr = p.cricket.rounds ? p.cricket.marks / p.cricket.rounds : 0;
    p.cricket.winPct = p.cricket.games ? (p.cricket.wins / p.cricket.games) * 100 : 0;
    p.baseball.avgRuns = p.baseball.games ? p.baseball.runs / p.baseball.games : 0;
    p.baseball.winPct = p.baseball.games ? (p.baseball.wins / p.baseball.games) * 100 : 0;
  }
  return s;
}

/**
 * Head-to-head from a player's OWN rows (their view). Each row carries the
 * winner name, so this stays correct even if the opponent has been reset.
 */
export function headToHead(results, a, b) {
  let aw = 0;
  let bw = 0;
  let n = 0;
  for (const r of results) {
    if (r.username !== a) continue;
    const opp = r.opponents || [];
    if (!opp.includes(b)) continue;
    n++;
    if (r.winner === a) aw++;
    else if (r.winner === b) bw++;
  }
  return { aw, bw, n };
}

/** Chronological per-game timeline for one player, from their result rows. */
export function playerTimeline(results, username) {
  const rows = results
    .filter((r) => r.username === username)
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

  const elo = [];
  const avg = [];
  const win = [];
  const mpr = [];
  let gi = 0;
  let xi = 0;
  let ci = 0;
  let wins = 0;

  for (const r of rows) {
    gi++;
    if (r.result === "win") wins++;
    const date = r.completedAt;
    elo.push({ x: gi, y: Math.round(r.eloAfter == null ? BASE_ELO : r.eloAfter), date });
    win.push({ x: gi, y: Math.round((wins / gi) * 100), date });
    if (r.gameType === "x01") {
      const pp = r.stats || {};
      if (pp.dartsThrown) {
        xi++;
        avg.push({ x: xi, y: Math.round((pp.pointsScored / pp.dartsThrown) * 3 * 10) / 10, date });
      }
    } else if (r.gameType === "cricket") {
      const pp = r.stats || {};
      if (pp.rounds) {
        ci++;
        mpr.push({ x: ci, y: Math.round(((pp.marks || 0) / pp.rounds) * 100) / 100, date });
      }
    }
  }
  return { elo, avg, win, mpr };
}

/**
 * Replay legacy `matches` into per-player result rows + final Elo ratings.
 * Used once by the admin "Rebuild from old games" action.
 */
export function replayMatchesToResults(matches, base = BASE_ELO, k = ELO_K) {
  const ordered = [...matches].sort(
    (a, b) => new Date(a.completedAt) - new Date(b.completedAt)
  );
  let R = {};
  const rows = [];
  for (const m of ordered) {
    R = applyEloUpdate(R, m.players, m.winner, k, base);
    for (const u of m.players) {
      rows.push({
        game_id: m.id,
        username: u,
        game_type: m.gameType,
        config: m.config || {},
        winner: m.winner,
        result: u === m.winner ? "win" : "loss",
        opponents: m.players.filter((p) => p !== u),
        stats: (m.perPlayer && m.perPlayer[u]) || {},
        elo_after: Math.round(R[u]),
        completed_at: m.completedAt,
      });
    }
  }
  const finalElos = {};
  for (const u in R) finalElos[u] = Math.round(R[u]);
  return { rows, finalElos };
}

export function allTargetsClosed(marks) {
  return X01_TARGETS.every((t) => (marks[t] || 0) >= 3);
}
