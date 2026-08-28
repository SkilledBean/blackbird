import { useState, useEffect } from "react";
import DartBoard from "./DartBoard";
import { dartLabel } from "@/lib/darts";

export default function PlayAroundTheClock({ game, resume, onProgress, onFinish, onQuit, castActive }) {
  const { players, config } = game;

  const blank = () => ({
    current: players.reduce((o, u) => ((o[u] = 1), o), {}),
    darts: players.reduce((o, u) => ((o[u] = 0), o), {}),
    log: players.reduce((o, u) => ((o[u] = []), o), {}),
  });

  const [s, setS] = useState(() => resume?.s ?? blank());
  const [turn, setTurn] = useState(() => resume?.turn ?? 0);
  const [turnDarts, setTurnDarts] = useState(() => resume?.turnDarts ?? []);
  const [mult, setMult] = useState(() => resume?.mult ?? 1);
  const [history, setHistory] = useState(() => resume?.history ?? []);

  useEffect(() => {
    onProgress && onProgress({ s, turn, turnDarts, mult, history });
  }, [s, turn, turnDarts, mult, history, onProgress]);

  const cur = players[turn % players.length];

  // target 1-20 then 21 = Bull (25)
  const targetNumber = (t) => (t === 21 ? 25 : t);
  const targetLabel = (t) => (t === 21 ? "Bull" : String(t));

  const commit = (darts) => {
    setHistory((h) => [...h, { s: JSON.parse(JSON.stringify(s)), turn }]);
    const ns = JSON.parse(JSON.stringify(s));
    ns.darts[cur] += darts.length;
    ns.log[cur] = [...ns.log[cur], ...darts];

    let currentTarget = ns.current[cur];
    for (const d of darts) {
      if (currentTarget > 21) break;
      const tn = targetNumber(currentTarget);
      if (d.n === tn) {
        currentTarget += 1;
      }
    }
    ns.current[cur] = currentTarget;

    setTurnDarts([]);
    setMult(1);

    if (currentTarget > 21) {
      const perPlayer = {};
      players.forEach((u) => {
        perPlayer[u] = {
          dartsThrown: ns.darts[u],
          targetsHit: ns.current[u] - 1,
          darts: ns.log[u],
        };
      });
      onFinish({
        id: game.id,
        gameType: "aroundTheClock",
        config,
        players,
        winner: cur,
        perPlayer,
        completedAt: new Date().toISOString(),
      });
      return;
    }
    setS(ns);
    setTurn((t) => t + 1);
  };

  const addDart = (dart) => {
    const next = [...turnDarts, dart];
    if (next.length === 3) return commit(next);
    setTurnDarts(next);
  };

  const undo = () => {
    if (turnDarts.length > 0) {
      setTurnDarts((d) => d.slice(0, -1));
      return;
    }
    setHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      setS(last.s);
      setTurn(last.turn);
      return h.slice(0, -1);
    });
  };

  const curTarget = s.current[cur];
  const progress = (u) => s.current[u] - 1; // 0..21

  return (
    <div className="fade">
      <div className="between mb-12">
        <div className="display" style={{ fontSize: "calc(17px * var(--fs))" }}>
          Around the Clock
        </div>
        <button className="btn btn-danger" style={{ padding: "7px 12px" }} onClick={onQuit}>
          Quit
        </button>
      </div>

      {!castActive && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, calc(120px * var(--fs))), 1fr))",
            gap: 10,
            marginBottom: 12,
          }}
        >
          {players.map((u) => {
            const active = u === cur;
            const done = progress(u);
            return (
              <div
                key={u}
                className="card pad-sm"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--line)",
                  background: active ? "var(--accent-soft)" : "var(--surface)",
                }}
              >
                <div className="between">
                  <span style={{ fontWeight: 700 }}>{u}</span>
                  {active && <span className="tag" style={{ color: "var(--accent)" }}>at the oche</span>}
                </div>
                <div
                  className="num"
                  style={{ fontSize: "calc(32px * var(--fs))", lineHeight: 1.05, marginTop: 2 }}
                >
                  Target: {targetLabel(s.current[u])}
                </div>
                <div style={{ marginTop: 6, background: "var(--line)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${(done / 21) * 100}%`,
                      height: "100%",
                      background: "var(--accent)",
                      borderRadius: 4,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
                <div className="tag" style={{ marginTop: 4 }}>
                  {done}/21 hit · {s.darts[u]} darts
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="between" style={{ marginBottom: 8 }}>
          <span className="tag">
            {cur} — dart {Math.min(turnDarts.length + 1, 3)} of 3
            {castActive ? ` · target ${targetLabel(curTarget)}` : ""}
          </span>
        </div>

        <div className="flex-wrap" style={{ minHeight: 34, marginBottom: 8 }}>
          {turnDarts.length === 0 && <span className="tag">tap a multiplier, then a number</span>}
          {turnDarts.map((d, i) => (
            <span key={i} className="btn" style={{ padding: "5px 10px", fontSize: "calc(13px * var(--fs))" }}>
              {dartLabel(d)}
            </span>
          ))}
        </div>

        <div className="row mb-12">
          {[1, 2, 3].map((m) => (
            <button
              key={m}
              className={`btn ${mult === m ? "btn-amber" : ""}`}
              style={{ flex: 1 }}
              onClick={() => setMult(m)}
            >
              {m === 1 ? "Single" : m === 2 ? "Double" : "Triple"}
            </button>
          ))}
        </div>

        <div className="grid-5">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <button key={n} className="chip" style={{ fontSize: "calc(15px * var(--fs))", padding: "12px 0" }} onClick={() => addDart({ n, mult })}>
              {n}
            </button>
          ))}
        </div>

        <div className="grid-4 mt-12">
          <button className="chip" onClick={() => addDart({ n: 25, mult: 1 })}>25</button>
          <button className="chip" onClick={() => addDart({ n: 25, mult: 2 })}>Bull</button>
          <button className="chip" onClick={() => addDart({ n: 0, mult: 0 })}>Miss</button>
          <button className="chip" onClick={undo} disabled={!turnDarts.length && !history.length}>
            Undo
          </button>
        </div>

        {!castActive && (
          <div style={{ marginTop: 14 }}>
            <DartBoard highlight={[targetNumber(curTarget)]} hits={turnDarts} />
          </div>
        )}
      </div>
    </div>
  );
}
