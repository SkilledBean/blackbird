import { useState } from "react";
import { BackBar, PlayerBadge } from "./ui";
import { BASE_ELO } from "@/lib/constants";

export default function Leaderboard({ usernames, stats, elo, openProfile, openRecords, back, playerColors }) {
  const [mode, setMode] = useState("overall");

  const rows = usernames
    .map((u) => ({ u, s: stats[u], elo: elo[u] || BASE_ELO }))
    .filter((r) => r.s)
    .filter((r) =>
      mode === "x01"
        ? r.s.x01.games > 0
        : mode === "cricket"
        ? r.s.cricket.games > 0
        : mode === "baseball"
        ? r.s.baseball.games > 0
        : true
    )
    .sort((a, b) => {
      if (mode === "x01") return b.s.x01.threeDartAvg - a.s.x01.threeDartAvg;
      if (mode === "cricket") return b.s.cricket.mpr - a.s.cricket.mpr;
      if (mode === "baseball") return b.s.baseball.avgRuns - a.s.baseball.avgRuns;
      return b.elo - a.elo;
    });

  const sub = (s) => {
    if (mode === "x01") return `3-dart avg ${s.x01.threeDartAvg.toFixed(1)} · ${s.x01.wins}-${s.x01.games - s.x01.wins}`;
    if (mode === "cricket") return `MPR ${s.cricket.mpr.toFixed(2)} · ${s.cricket.wins}-${s.cricket.games - s.cricket.wins}`;
    if (mode === "baseball") return `avg runs ${s.baseball.avgRuns.toFixed(1)} · ${s.baseball.wins}-${s.baseball.games - s.baseball.wins}`;
    return `win% ${s.winPct.toFixed(0)} · ${s.wins}-${s.games - s.wins}`;
  };
  const big = (r) => {
    if (mode === "x01") return r.s.x01.threeDartAvg.toFixed(1);
    if (mode === "cricket") return r.s.cricket.mpr.toFixed(2);
    if (mode === "baseball") return r.s.baseball.avgRuns.toFixed(1);
    return Math.round(r.elo);
  };

  const eloArrow = (s) => {
    const ch = s.eloChange || 0;
    if (ch > 0) return { symbol: "▲", color: "var(--accent)" };
    if (ch < 0) return { symbol: "▼", color: "var(--red)" };
    return null;
  };

  const formDots = (s) => {
    if (!s.lastFive || s.lastFive.length === 0) return null;
    return s.lastFive;
  };

  return (
    <div className="fade">
      <BackBar back={back} title="Standings" />

      <div className="row mb-12" style={{ flexWrap: "wrap" }}>
        {[
          ["overall", "Overall"],
          ["x01", "X01"],
          ["cricket", "Cricket"],
          ["baseball", "Baseball"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={`btn ${mode === k ? "btn-primary" : ""}`}
            style={{ flex: "1 1 22%" }}
            onClick={() => setMode(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {openRecords && (
        <button className="btn mb-12" style={{ width: "100%" }} onClick={openRecords}>
          Records
        </button>
      )}

      {rows.length === 0 && <p className="subtle">No completed games in this category yet.</p>}

      <div className="stack-8">
        {rows.map((r, i) => {
          const arrow = mode === "overall" ? eloArrow(r.s) : null;
          const form = formDots(r.s);
          return (
            <div
              key={r.u}
              className="card pad-sm clickable"
              style={{ display: "flex", alignItems: "center", gap: 12 }}
              onClick={() => openProfile(r.u)}
            >
              <div className="num" style={{ fontSize: "calc(20px * var(--fs))", width: "calc(22px * var(--fs))", color: i === 0 ? "var(--amber)" : "var(--muted)" }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <PlayerBadge username={r.u} color={playerColors?.[r.u]} size={22} />
                  {arrow && (
                    <span style={{ fontSize: "calc(10px * var(--fs))", color: arrow.color }}>
                      {arrow.symbol}{Math.abs(r.s.eloChange)}
                    </span>
                  )}
                </div>
                <div className="tag" style={{ marginTop: 2 }}>
                  {sub(r.s)}
                  {form && (
                    <span style={{ marginLeft: 8 }}>
                      {form.map((f, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: "inline-block",
                            width: "calc(7px * var(--fs))",
                            height: "calc(7px * var(--fs))",
                            borderRadius: "50%",
                            background: f === "W" ? "var(--accent)" : "var(--red)",
                            marginRight: 2,
                          }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              </div>
              <div className="num" style={{ fontSize: "calc(17px * var(--fs))", color: "var(--accent)" }}>{big(r)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
