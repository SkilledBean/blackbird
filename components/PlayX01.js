import { useState, useEffect } from "react";
import { Modal } from "./ui";
import DartBoard from "./DartBoard";
import { dartValue, dartLabel } from "@/lib/darts";

export default function PlayX01({ game, resume, onProgress, onFinish, onQuit, castActive }) {
  const { players, config } = game;
  const start = config.startScore;

  const blank = () => ({
    scores: players.reduce((o, u) => ((o[u] = start), o), {}),
    darts: players.reduce((o, u) => ((o[u] = 0), o), {}),
    points: players.reduce((o, u) => ((o[u] = 0), o), {}),
    highestTurn: players.reduce((o, u) => ((o[u] = 0), o), {}),
    checkout: players.reduce((o, u) => ((o[u] = 0), o), {}),
    log: players.reduce((o, u) => ((o[u] = []), o), {}),
    // per-position [1st, 2nd, 3rd] dart sums/counts for averages
    dartPos: players.reduce(
      (o, u) => ((o[u] = [{ sum: 0, count: 0 }, { sum: 0, count: 0 }, { sum: 0, count: 0 }]), o),
      {}
    ),
  });

  const [s, setS] = useState(() => resume?.s ?? blank());
  const [turn, setTurn] = useState(() => resume?.turn ?? 0);
  const [turnDarts, setTurnDarts] = useState(() => resume?.turnDarts ?? []);
  const [mult, setMult] = useState(() => resume?.mult ?? 1);
  const [msg, setMsg] = useState(() => resume?.msg ?? "");
  const [history, setHistory] = useState(() => resume?.history ?? []);

  useEffect(() => {
    onProgress && onProgress({ s, turn, turnDarts, mult, msg, history });
  }, [s, turn, turnDarts, mult, msg, history, onProgress]);

  const cur = players[turn % players.length];
  const turnSum = turnDarts.reduce((a, d) => a + dartValue(d), 0);
  const remaining = s.scores[cur] - turnSum;

  const commit = (darts, kind) => {
    setHistory((h) => [...h, { s: JSON.parse(JSON.stringify(s)), turn }]);
    const sum = darts.reduce((a, d) => a + dartValue(d), 0);
    const scoreBefore = s.scores[cur];
    const ns = JSON.parse(JSON.stringify(s));
    ns.darts[cur] += darts.length;
    ns.log[cur] = [...ns.log[cur], ...darts];
    // per-position averages: busted turns count the dart but score 0,
    // matching how the overall 3-dart average treats busts
    const counted = kind !== "bust";
    darts.forEach((d, i) => {
      if (i > 2) return;
      ns.dartPos[cur][i].count += 1;
      ns.dartPos[cur][i].sum += counted ? dartValue(d) : 0;
    });
    if (kind !== "bust") {
      ns.scores[cur] = scoreBefore - sum;
      ns.points[cur] += sum;
      ns.highestTurn[cur] = Math.max(ns.highestTurn[cur], sum);
    }
    setTurnDarts([]);
    setMult(1);

    if (kind === "win") {
      ns.checkout[cur] = scoreBefore;
      const perPlayer = {};
      players.forEach((u) => {
        perPlayer[u] = {
          dartsThrown: ns.darts[u],
          pointsScored: ns.points[u],
          highestTurn: ns.highestTurn[u],
          checkout: u === cur ? scoreBefore : 0,
          finalScore: ns.scores[u],
          darts: ns.log[u],
          dartPos: ns.dartPos[u],
        };
      });
      onFinish({
        id: game.id,
        gameType: "x01",
        config,
        players,
        winner: cur,
        perPlayer,
        completedAt: new Date().toISOString(),
      });
      return;
    }
    setS(ns);
    setMsg(kind === "bust" ? "Bust — no score" : "");
    setTurn((t) => t + 1);
  };

  const addDart = (dart) => {
    const next = [...turnDarts, dart];
    const rem = s.scores[cur] - next.reduce((a, d) => a + dartValue(d), 0);
    if (rem < 0) return commit(next, "bust");
    if (rem === 0) {
      if (!config.doubleOut || dart.mult === 2) return commit(next, "win");
      return commit(next, "bust");
    }
    if (config.doubleOut && rem === 1) return commit(next, "bust");
    if (next.length === 3) return commit(next, "normal");
    setMsg("");
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
      setMsg("");
      return h.slice(0, -1);
    });
  };

  const avg = (u) => (s.darts[u] ? ((s.points[u] / s.darts[u]) * 3).toFixed(1) : "0.0");

  return (
    <div className="fade">
      <div className="between mb-12">
        <div className="display" style={{ fontSize: "calc(17px * var(--fs))" }}>
          {start} · {config.doubleOut ? "double out" : "straight out"}
        </div>
        <button className="btn btn-danger" style={{ padding: "7px 12px" }} onClick={onQuit}>
          Quit
        </button>
      </div>

      {!castActive && (
      <div
        style={{
          display: "grid",
          // two side-by-side normally; drops to one per row once the score
          // text is scaled up enough that two no longer fit
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, calc(120px * var(--fs))), 1fr))",
          gap: 10,
          marginBottom: 12,
        }}
      >
        {players.map((u) => {
          const active = u === cur;
          const shown = active ? remaining : s.scores[u];
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
                style={{ fontSize: "calc(44px * var(--fs))", lineHeight: 1.05, marginTop: 2, color: shown <= 40 ? "var(--red)" : "var(--ink)" }}
              >
                {shown}
              </div>
              <div className="tag" style={{ marginTop: 4 }}>
                avg {avg(u)} · {s.darts[u]} darts
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
            {castActive ? ` · ${remaining} left` : ""}
          </span>
          <span style={{ minHeight: 16, color: "var(--red)", fontSize: "calc(12px * var(--fs))", fontWeight: 600 }}>{msg}</span>
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
            <DartBoard hits={turnDarts} />
          </div>
        )}
      </div>
    </div>
  );
}
