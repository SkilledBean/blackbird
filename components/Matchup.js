import { useState } from "react";
import { BackBar, PlayerBadge } from "./ui";
import { headToHead } from "@/lib/stats";
import { BASE_ELO } from "@/lib/constants";

export default function Matchup({ usernames, elo, results, stats, back, playerColors }) {
  const [a, setA] = useState(usernames[0] || "");
  const [b, setB] = useState(usernames[1] || "");

  if (usernames.length < 2) {
    return (
      <div className="fade">
        <BackBar back={back} title="Matchup" />
        <p className="subtle">Need at least two players with games logged.</p>
      </div>
    );
  }

  const Ra = elo[a] || BASE_ELO;
  const Rb = elo[b] || BASE_ELO;
  const valid = a && b && a !== b;
  const pA = valid ? 1 / (1 + Math.pow(10, (Rb - Ra) / 400)) : 0.5;
  const h2h = valid ? headToHead(results, a, b) : { aw: 0, bw: 0, n: 0 };

  const Picker = ({ val, set, label }) => (
    <div style={{ flex: 1 }}>
      <div className="tag" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <select className="select" value={val} onChange={(e) => set(e.target.value)}>
        {usernames.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="fade">
      <BackBar back={back} title="Matchup Predictor" />

      <div className="card mb-12">
        <div className="row">
          <Picker val={a} set={setA} label="Player A" />
          <Picker val={b} set={setB} label="Player B" />
        </div>
      </div>

      {!valid ? (
        <p className="subtle">Pick two different players.</p>
      ) : (
        <>
          <div className="card mb-12">
            <div className="tag" style={{ marginBottom: 12 }}>
              Predicted Win Likelihood (Elo)
            </div>
            <div className="row" style={{ alignItems: "center" }}>
              <span className="num" style={{ fontSize: "calc(30px * var(--fs))", color: "var(--accent)" }}>
                {(pA * 100).toFixed(0)}%
              </span>
              <div className="bar">
                <div style={{ width: `${pA * 100}%`, background: "var(--accent)" }} />
                <div style={{ width: `${(1 - pA) * 100}%`, background: "var(--red)" }} />
              </div>
              <span className="num" style={{ fontSize: "calc(30px * var(--fs))", color: "var(--red)" }}>
                {((1 - pA) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="between" style={{ marginTop: 8 }}>
              <span style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <PlayerBadge username={a} color={playerColors?.[a]} size={18} showName={false} />
                {a} <span className="tag">{Math.round(Ra)}</span>
              </span>
              <span style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span className="tag">{Math.round(Rb)}</span> {b}
                <PlayerBadge username={b} color={playerColors?.[b]} size={18} showName={false} />
              </span>
            </div>
          </div>

          <div className="card mb-12">
            <div className="tag" style={{ marginBottom: 6 }}>
              Head to Head
            </div>
            {h2h.n === 0 ? (
              <p className="subtle" style={{ margin: 0 }}>
                Never played each other — prediction is Elo-only and rough.
              </p>
            ) : (
              <div className="num" style={{ fontSize: "calc(22px * var(--fs))", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <PlayerBadge username={a} color={playerColors?.[a]} size={20} showName={false} />
                {a} {h2h.aw} — {h2h.bw} {b}
                <PlayerBadge username={b} color={playerColors?.[b]} size={20} showName={false} />{" "}
                <span className="tag" style={{ fontSize: "calc(12px * var(--fs-chrome))" }}>
                  ({h2h.n} games)
                </span>
              </div>
            )}
          </div>

          <div className="card">
            <div className="tag" style={{ marginBottom: 10 }}>
              Form (3-Dart Avg)
            </div>
            <div className="row">
              <div style={{ flex: 1, textAlign: "center" }}>
                <div className="num" style={{ fontSize: "calc(24px * var(--fs))" }}>
                  {stats[a]?.x01.threeDartAvg.toFixed(1) || "—"}
                </div>
                <div className="tag" style={{ marginTop: 2 }}>
                  {a}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div className="num" style={{ fontSize: "calc(24px * var(--fs))" }}>
                  {stats[b]?.x01.threeDartAvg.toFixed(1) || "—"}
                </div>
                <div className="tag" style={{ marginTop: 2 }}>
                  {b}
                </div>
              </div>
            </div>
          </div>

          <p className="tag" style={{ marginTop: 14, lineHeight: 1.5, textTransform: "none", letterSpacing: 0 }}>
            Elo updates after every game (start 1000, K=24). With few games it&apos;s a rough estimate; it sharpens as more games are logged.
          </p>
        </>
      )}
    </div>
  );
}
