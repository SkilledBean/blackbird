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

export default function Home({ setView, stats, elo, players, gameCount, results, openProfile, playerColors }) {
  const visible = players.filter((p) => !p.hidden);
  const weekly = gamesPerWeek(results || []);
  const ranked = visible
    .map((p) => ({ u: p.username, elo: elo[p.username] || BASE_ELO, s: stats[p.username] }))
    .sort((a, b) => b.elo - a.elo);

  const topAvg = visible.length
    ? Math.max(0, ...visible.map((p) => stats[p.username]?.x01.threeDartAvg || 0))
    : 0;

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
    </div>
  );
}
