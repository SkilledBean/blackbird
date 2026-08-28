import { BackBar, Stat, Mini } from "./ui";
import { LineChart } from "./Charts";
import PlayerCard from "./PlayerCard";
import { playerTimeline } from "@/lib/stats";

export default function Profile({ user, stats, elo, results, onOpenAccount, back }) {
  if (!stats) {
    return (
      <div className="fade">
        <BackBar back={back} title={user} />
        <p className="subtle">No games logged yet.</p>
      </div>
    );
  }

  const timeline = playerTimeline(results, user);
  const dartAvg = stats.x01.dartAvg || [0, 0, 0];

  const recent = results
    .filter((r) => r.username === user)
    .slice(-8)
    .reverse();

  // most recent cricket game with per-round marks (recorded from v1.2 on)
  const lastCricket = results
    .filter(
      (r) =>
        r.username === user &&
        r.gameType === "cricket" &&
        Array.isArray(r.stats?.roundMarks) &&
        r.stats.roundMarks.length > 0
    )
    .slice(-1)[0];

  const label = (r) => {
    if (r.gameType === "x01") return `${r.config.startScore}`;
    if (r.gameType === "baseball") return "Baseball";
    if (r.gameType === "aroundTheClock") return "Clock";
    if (r.gameType === "killer") return "Killer";
    if (r.gameType === "shanghai") return "Shanghai";
    if (r.gameType === "halveit") return "Halve It";
    if (r.gameType === "gotcha") return "Gotcha";
    if (r.gameType === "tictactoe") return "Tic-Tac-Toe";
    const v = r.config?.variant;
    return v === "cutthroat" ? "Cricket·Cut" : v === "noscore" ? "Cricket·NS" : "Cricket";
  };

  const fmtDate = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className="fade">
      <BackBar back={back} title={user} />

      <PlayerCard user={user} stats={stats} elo={elo} onOpenAccount={onOpenAccount} />

      <div className="grid-3 mb-12">
        <Stat label="Elo" value={Math.round(elo || 1000)} />
        <Stat label="Win %" value={stats.winPct.toFixed(0)} />
        <Stat label="Games" value={stats.games} />
      </div>

      <div className="charts-2col">
        <div className="card">
          <h3 className="section-title">Elo over time</h3>
          <LineChart data={timeline.elo} color="var(--accent)" />
        </div>

        {stats.x01.games > 0 && (
          <div className="card">
            <h3 className="section-title">3-dart average over time</h3>
            <LineChart data={timeline.avg} color="#3b82f6" decimals={1} />
          </div>
        )}

        <div className="card">
          <h3 className="section-title">Win % over time</h3>
          <LineChart data={timeline.win} color="#16a34a" unit="%" />
        </div>

        {stats.cricket.games > 0 && (
          <div className="card">
            <h3 className="section-title">Cricket MPR over time</h3>
            <LineChart data={timeline.mpr} color="var(--amber)" decimals={2} />
          </div>
        )}
      </div>

      {stats.x01.games > 0 && (
      <div className="card mb-12">
        <h3 className="section-title">X01</h3>
        <div className="grid-4">
          <Mini label="3-dart avg" value={stats.x01.threeDartAvg.toFixed(1)} />
          <Mini label="High turn" value={stats.x01.highestTurn} />
          <Mini label="Best leg" value={stats.x01.bestLeg ? `${stats.x01.bestLeg}d` : "—"} />
          <Mini label="High out" value={stats.x01.highestCheckout || "—"} />
        </div>
        <div className="grid-3" style={{ marginTop: 8 }}>
          <Mini label="1st dart" value={dartAvg[0] ? dartAvg[0].toFixed(1) : "—"} />
          <Mini label="2nd dart" value={dartAvg[1] ? dartAvg[1].toFixed(1) : "—"} />
          <Mini label="3rd dart" value={dartAvg[2] ? dartAvg[2].toFixed(1) : "—"} />
        </div>
        <div className="tag" style={{ marginTop: 10 }}>
          {stats.x01.wins}-{stats.x01.games - stats.x01.wins} record
        </div>
      </div>
      )}

      {stats.cricket.games > 0 && (
      <div className="card mb-12">
        <h3 className="section-title">Cricket</h3>
        <div className="grid-4">
          <Mini label="MPR" value={stats.cricket.mpr.toFixed(2)} />
          <Mini label="Best MPR" value={stats.cricket.bestMpr ? stats.cricket.bestMpr.toFixed(2) : "—"} />
          <Mini label="Win %" value={stats.cricket.winPct.toFixed(0)} />
          <Mini label="Games" value={stats.cricket.games} />
        </div>
        {lastCricket && (
          <div style={{ marginTop: 10 }}>
            <div className="tag" style={{ marginBottom: 6 }}>
              Last game · MPR {(lastCricket.stats.mpr ?? (lastCricket.stats.rounds ? lastCricket.stats.marks / lastCricket.stats.rounds : 0)).toFixed(2)} · marks by round
            </div>
            <div className="flex-wrap">
              {lastCricket.stats.roundMarks.map((m, i) => (
                <span key={i} className="chip" style={{ padding: "4px 9px", fontSize: "calc(12px * var(--fs))" }}>
                  R{i + 1}: {m}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {stats.x01.games > 0 && stats.x01.first9Avg > 0 && (
      <div className="card mb-12">
        <h3 className="section-title">X01 advanced</h3>
        <div className="grid-3">
          <Mini label="First 9 avg" value={stats.x01.first9Avg.toFixed(1)} />
          <Mini label="High out" value={stats.x01.highestCheckout || "—"} />
          <Mini label="High turn" value={stats.x01.highestTurn} />
        </div>
      </div>
      )}

      {stats.cricket.games > 0 && Object.keys(stats.cricket.perNumber || {}).length > 0 && (
      <div className="card mb-12">
        <h3 className="section-title">Cricket number strengths</h3>
        <div className="grid-4" style={{ gap: 6 }}>
          {["20", "19", "18", "17", "16", "15", "B"].map((k) => {
            const pn = (stats.cricket.perNumber || {})[k];
            if (!pn || !pn.darts) return null;
            const avg = (pn.hits / pn.darts).toFixed(2);
            return (
              <div key={k} style={{ textAlign: "center" }}>
                <div className="num" style={{ fontSize: "calc(16px * var(--fs))", color: "var(--accent)" }}>{avg}</div>
                <div className="tag">{k === "B" ? "Bull" : k}</div>
              </div>
            );
          })}
        </div>
        <div className="tag" style={{ marginTop: 6, textTransform: "none", letterSpacing: 0 }}>
          Average marks per dart thrown at each number
        </div>
      </div>
      )}

      {stats.baseball.games > 0 && (
      <div className="card mb-12">
        <h3 className="section-title">Baseball</h3>
        <div className="grid-3">
          <Mini label="Avg runs" value={stats.baseball.avgRuns.toFixed(1)} />
          <Mini label="Win %" value={stats.baseball.winPct.toFixed(0)} />
          <Mini label="Games" value={stats.baseball.games} />
        </div>
      </div>
      )}

      {(stats.aroundTheClock.games > 0 || stats.killer.games > 0 || stats.shanghai.games > 0 || stats.halveit.games > 0 || stats.gotcha.games > 0 || stats.tictactoe.games > 0) && (
      <div className="card mb-12">
        <h3 className="section-title">Other games</h3>
        <div className="grid-3" style={{ gap: 8 }}>
          {stats.aroundTheClock.games > 0 && <Mini label="Clock" value={`${stats.aroundTheClock.wins}-${stats.aroundTheClock.games - stats.aroundTheClock.wins}`} />}
          {stats.killer.games > 0 && <Mini label="Killer" value={`${stats.killer.wins}-${stats.killer.games - stats.killer.wins}`} />}
          {stats.shanghai.games > 0 && <Mini label="Shanghai" value={`${stats.shanghai.wins}-${stats.shanghai.games - stats.shanghai.wins}`} />}
          {stats.halveit.games > 0 && <Mini label="Halve It" value={`${stats.halveit.wins}-${stats.halveit.games - stats.halveit.wins}`} />}
          {stats.gotcha.games > 0 && <Mini label="Gotcha" value={`${stats.gotcha.wins}-${stats.gotcha.games - stats.gotcha.wins}`} />}
          {stats.tictactoe.games > 0 && <Mini label="Tic-Tac-Toe" value={`${stats.tictactoe.wins}-${stats.tictactoe.games - stats.tictactoe.wins}`} />}
        </div>
      </div>
      )}

      {stats.bestWinStreak > 0 && (
      <div className="card mb-12">
        <h3 className="section-title">Streaks</h3>
        <div className="grid-3">
          <Mini label="Best streak" value={stats.bestWinStreak} />
          <Mini label="Current" value={stats.winStreak} />
          <Mini label="Form" value={stats.lastFive ? stats.lastFive.join("") : "—"} />
        </div>
      </div>
      )}

      <div className="card">
        <h3 className="section-title">Recent</h3>
        {recent.length === 0 && <span className="tag">none</span>}
        {recent.map((r, i) => (
          <div
            key={i}
            className="between"
            style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: "calc(14px * var(--fs))" }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block" }}>
                {label(r)} vs {(r.opponents || []).join(", ") || "solo"}
              </span>
              <span className="tag" style={{ textTransform: "none", letterSpacing: 0, fontSize: "calc(11px * var(--fs-chrome))" }}>
                {fmtDate(r.completedAt)}
              </span>
            </span>
            <span style={{ color: r.result === "win" ? "var(--accent)" : "var(--red)", fontWeight: 800, marginLeft: 12 }}>
              {r.result === "win" ? "W" : "L"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
