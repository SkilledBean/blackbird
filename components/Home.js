import { useMemo } from "react";
import { Stat, PlayerBadge } from "./ui";
import { BarChart } from "./Charts";
import { BASE_ELO } from "@/lib/constants";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS = 13; // ~3 months

/** Unique games per week over the last ~3 months, oldest bucket first. */
function gamesPerWeek(results) {
  const seen = new Map(); // gameId -> completion date
  for (const r of results) {
    if (r.gameId && !seen.has(r.gameId)) seen.set(r.gameId, new Date(r.completedAt));
  }
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // tomorrow 00:00
  const buckets = Array.from({ length: WEEKS }, (_, i) => ({
    x: i + 1,
    y: 0,
    date: new Date(end.getTime() - (WEEKS - i) * WEEK_MS).toISOString(),
  }));
  for (const d of seen.values()) {
    const weeksAgo = Math.floor((end.getTime() - d.getTime()) / WEEK_MS);
    const idx = WEEKS - 1 - weeksAgo;
    if (idx >= 0 && idx < WEEKS) buckets[idx].y++;
  }
  return buckets;
}

function weeklyHighlights(results) {
  const cutoff = Date.now() - WEEK_MS;
  const week = (results || []).filter((r) => new Date(r.completedAt).getTime() > cutoff);
  if (week.length === 0) return null;

  const gameIds = new Set();
  const gamesBy = {};
  const winsBy = {};
  let bestTurn = null;
  let bestCheckout = null;
  let bestMpr = null;

  for (const r of week) {
    if (r.gameId) gameIds.add(r.gameId);
    gamesBy[r.username] = (gamesBy[r.username] || 0) + 1;
    if (r.result === "win") winsBy[r.username] = (winsBy[r.username] || 0) + 1;

    const s = r.stats || {};
    if (r.gameType === "x01") {
      if (s.highestTurn && (!bestTurn || s.highestTurn > bestTurn.val))
        bestTurn = { user: r.username, val: s.highestTurn };
      if (s.checkout && (!bestCheckout || s.checkout > bestCheckout.val))
        bestCheckout = { user: r.username, val: s.checkout };
    }
    if (r.gameType === "cricket" && s.rounds && s.marks) {
      const mpr = s.marks / s.rounds;
      if (!bestMpr || mpr > bestMpr.val)
        bestMpr = { user: r.username, val: Math.round(mpr * 100) / 100 };
    }
  }

  const mostActive = Object.entries(gamesBy).sort((a, b) => b[1] - a[1])[0];
  const topWinner = Object.entries(winsBy).sort((a, b) => b[1] - a[1])[0];

  const items = [];
  items.push({ label: "Games this week", value: String(gameIds.size || week.length) });
  if (mostActive) items.push({ label: "Most active", value: mostActive[0], count: `${mostActive[1]} games` });
  if (topWinner && topWinner[1] > 0) items.push({ label: "Most wins", value: topWinner[0], count: `${topWinner[1]} wins` });
  if (bestTurn) items.push({ label: "High turn", value: bestTurn.user, count: String(bestTurn.val) });
  if (bestCheckout) items.push({ label: "Best checkout", value: bestCheckout.user, count: String(bestCheckout.val) });
  if (bestMpr) items.push({ label: "Best MPR", value: bestMpr.user, count: bestMpr.val.toFixed(2) });

  return items;
}

export default function Home({ setView, stats, elo, players, gameCount, results, openProfile, playerColors }) {
  const visible = players.filter((p) => !p.hidden);
  const weekly = gamesPerWeek(results || []);
  const ranked = visible
    .map((p) => ({ u: p.username, elo: elo[p.username] || BASE_ELO, s: stats[p.username] }))
    .sort((a, b) => b.elo - a.elo);

  const topAvg = visible.length
    ? Math.max(0, ...visible.map((p) => stats[p.username]?.x01.threeDartAvg || 0))
    : 0;

  const highlights = useMemo(() => weeklyHighlights(results), [results]);

  return (
    <div className="fade">
      <div className="grid-3 mb-12">
        <Stat label="Players" value={visible.length} />
        <Stat label="Games" value={gameCount} />
        <Stat label="Top avg" value={topAvg ? topAvg.toFixed(1) : "—"} />
      </div>

      <div className="card mb-12">
        <h3 className="section-title">Games · Last 3 Months</h3>
        <BarChart data={weekly} />
      </div>

      <button
        className="btn btn-primary"
        style={{ width: "100%", fontSize: "calc(16px * var(--fs))", padding: 16 }}
        onClick={() => setView("setup")}
      >
        Start a Game
      </button>

      <hr className="sep" />
      <h2 className="section-title">Top of the Board</h2>

      {ranked.length === 0 && (
        <p className="subtle">No players yet. Start a game to add some.</p>
      )}

      <div className="stack-8">
        {ranked.slice(0, 5).map((r, i) => (
          <div
            key={r.u}
            className="card pad-sm clickable"
            style={{ display: "flex", alignItems: "center", gap: 12 }}
            onClick={() => openProfile(r.u)}
          >
            <div
              className="num"
              style={{ fontSize: "calc(20px * var(--fs))", width: "calc(24px * var(--fs))", color: i === 0 ? "var(--amber)" : "var(--muted)" }}
            >
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <PlayerBadge username={r.u} color={playerColors?.[r.u]} size={22} />
              <div className="tag" style={{ marginTop: 2 }}>
                {r.s ? `${r.s.wins}-${r.s.games - r.s.wins} · avg ${r.s.x01.threeDartAvg.toFixed(1)}` : "no games"}
              </div>
            </div>
            <div className="num" style={{ fontSize: "calc(17px * var(--fs))", color: "var(--accent)" }}>
              {Math.round(r.elo)}
            </div>
          </div>
        ))}
      </div>

      {highlights && highlights.length > 0 && (
        <>
          <hr className="sep" />
          <h2 className="section-title">Weekly Highlights</h2>
          <div className="card">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {highlights.map((h, i) => (
                <div key={i} className="between" style={{ alignItems: "center", padding: "4px 0" }}>
                  <span className="tag" style={{ flex: "none" }}>{h.label}</span>
                  <span style={{ fontWeight: 700, fontSize: "calc(14px * var(--fs))", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {h.count && <span style={{ color: "var(--accent)" }}>{h.count}</span>}
                    {h.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
