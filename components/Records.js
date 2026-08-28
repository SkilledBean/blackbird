import { BackBar, Mini, PlayerBadge } from "./ui";

export default function Records({ usernames, stats, results, back, playerColors }) {
  const records = computeRecords(results);

  return (
    <div className="fade">
      <BackBar back={back} title="Records" />

      {records.length === 0 && <p className="subtle">Play some games to see records here.</p>}

      <div className="stack-8">
        {records.map((r, i) => (
          <div key={i} className="card pad-sm" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "calc(14px * var(--fs))" }}>{r.title}</div>
              <div className="tag" style={{ marginTop: 2 }}><PlayerBadge username={r.holder} color={playerColors?.[r.holder]} size={18} /> {r.detail ? `· ${r.detail}` : ""}</div>
            </div>
            <div className="num" style={{ fontSize: "calc(20px * var(--fs))", color: "var(--accent)" }}>
              {r.value}
            </div>
          </div>
        ))}
      </div>

      {Object.keys(stats).length > 0 && (
        <div className="card mt-12">
          <h3 className="section-title">Streaks</h3>
          <div className="stack-8">
            {usernames
              .filter((u) => stats[u] && stats[u].bestWinStreak > 0)
              .sort((a, b) => (stats[b].bestWinStreak || 0) - (stats[a].bestWinStreak || 0))
              .map((u) => (
                <div key={u} className="between" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                  <PlayerBadge username={u} color={playerColors?.[u]} size={18} />
                  <span>
                    <span className="num" style={{ color: "var(--accent)", fontSize: "calc(15px * var(--fs))" }}>
                      {stats[u].bestWinStreak}
                    </span>
                    <span className="tag" style={{ marginLeft: 6 }}>best</span>
                    {stats[u].winStreak > 0 && (
                      <span className="tag" style={{ marginLeft: 8, color: "var(--amber)" }}>
                        {stats[u].winStreak} current
                      </span>
                    )}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function computeRecords(results) {
  const out = [];
  let bestMpr = null;
  let highCheckout = null;
  let bestLeg = null;
  let highTurn = null;
  let bestBaseball = null;

  const byGame = {};
  for (const r of results) {
    const k = r.gameId || r.completedAt;
    if (!byGame[k]) byGame[k] = [];
    byGame[k].push(r);
  }

  for (const r of results) {
    const pp = r.stats || {};
    if (r.gameType === "cricket" && pp.rounds) {
      const mpr = (pp.marks || 0) / pp.rounds;
      if (!bestMpr || mpr > bestMpr.val) bestMpr = { val: mpr, user: r.username, date: r.completedAt };
    }
    if (r.gameType === "x01") {
      if (r.result === "win" && pp.checkout && (!highCheckout || pp.checkout > highCheckout.val)) {
        highCheckout = { val: pp.checkout, user: r.username, date: r.completedAt };
      }
      if (r.result === "win" && pp.dartsThrown && (!bestLeg || pp.dartsThrown < bestLeg.val)) {
        bestLeg = { val: pp.dartsThrown, user: r.username, date: r.completedAt };
      }
      if (pp.highestTurn && (!highTurn || pp.highestTurn > highTurn.val)) {
        highTurn = { val: pp.highestTurn, user: r.username, date: r.completedAt };
      }
    }
    if (r.gameType === "baseball" && r.result === "win") {
      const runs = pp.runs || 0;
      if (!bestBaseball || runs > bestBaseball.val) bestBaseball = { val: runs, user: r.username, date: r.completedAt };
    }
  }

  const fmt = (iso) => {
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; }
  };

  if (highTurn) out.push({ title: "Highest Turn", value: highTurn.val, holder: highTurn.user, detail: fmt(highTurn.date) });
  if (highCheckout) out.push({ title: "Highest Checkout", value: highCheckout.val, holder: highCheckout.user, detail: fmt(highCheckout.date) });
  if (bestLeg) out.push({ title: "Best Leg (Fewest Darts)", value: `${bestLeg.val}d`, holder: bestLeg.user, detail: fmt(bestLeg.date) });
  if (bestMpr) out.push({ title: "Best MPR Game", value: bestMpr.val.toFixed(2), holder: bestMpr.user, detail: fmt(bestMpr.date) });
  if (bestBaseball) out.push({ title: "Most Runs (Baseball)", value: bestBaseball.val, holder: bestBaseball.user, detail: fmt(bestBaseball.date) });

  return out;
}
