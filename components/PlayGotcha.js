import { useState, useEffect } from "react";
import DartBoard from "./DartBoard";
import { dartValue, dartLabel } from "@/lib/darts";

export default function PlayGotcha({ game, resume, onProgress, onFinish, onQuit, castActive }) {
  const { players, config } = game;
  const target = config.targetScore || 301;

  const blank = () => ({
    scores: players.reduce((o, u) => ((o[u] = 0), o), {}),
    resets: players.reduce((o, u) => ((o[u] = { dealt: 0, received: 0 }), o), {}),
    darts: players.reduce((o, u) => ((o[u] = 0), o), {}),
    log: players.reduce((o, u) => ((o[u] = []), o), {}),
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

  const commit = (darts, kind) => {
    setHistory((h) => [...h, { s: JSON.parse(JSON.stringify(s)), turn }]);
    const sum = darts.reduce((a, d) => a + dartValue(d), 0);
    const ns = JSON.parse(JSON.stringify(s));
    ns.darts[cur] += darts.length;
    ns.log[cur] = [...ns.log[cur], ...darts];

    if (kind === "win") {
      ns.scores[cur] = target;
      const perPlayer = {};
      players.forEach((u) => {
        perPlayer[u] = {
          finalScore: ns.scores[u],
          resetsDealt: ns.resets[u].dealt,
          resetsReceived: ns.resets[u].received,
          dartsThrown: ns.darts[u],
          darts: ns.log[u],
        };
      });
      onFinish({
        id: game.id,
        gameType: "gotcha",
        config,
        players,
        winner: cur,
        perPlayer,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    let feedback = "";
    if (kind === "bust") {
      feedback = "BUST!";
    } else {
      ns.scores[cur] += sum;
      // Check if our new score matches any other player -> reset them
      const resetted = [];
      players.forEach((o) => {
        if (o !== cur && ns.scores[o] === ns.scores[cur] && ns.scores[o] > 0) {
          ns.scores[o] = 0;
          ns.resets[cur].dealt += 1;
          ns.resets[o].received += 1;
          resetted.push(o);
        }
      });
      if (resetted.length > 0) {
        feedback = `RESET ${resetted.join(", ")}!`;
      }
    }

    setS(ns);
    setTurnDarts([]);
    setMult(1);
    setMsg(feedback);
    setTurn((t) => t + 1);
  };

  const addDart = (dart) => {
    const next = [...turnDarts, dart];
    const sum = next.reduce((a, d) => a + dartValue(d), 0);
    const newScore = s.scores[cur] + sum;

    if (newScore > target) {
      return commit(next, "bust");
    }
    if (newScore === target) {
      return commit(next, "win");
    }
    if (next.length === 3) {
      return commit(next, "normal");
    }
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

  const pct = (u) => Math.round((s.scores[u] / target) * 100);

  return (
    <div className="fade">
      <div className="between mb-12">
        <div className="display" style={{ fontSize: "calc(17px * var(--fs))" }}>
          Gotcha · {target}
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
            const shown = active ? s.scores[u] + turnSum : s.scores[u];
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
                  {active && <span className="tag" style={{ color: "var(--accent)" }}>throwing</span>}
                </div>
                <div
                  className="num"
                  style={{ fontSize: "calc(44px * var(--fs))", lineHeight: 1.05, marginTop: 2 }}
                >
                  {shown}
                </div>
                <div className="tag" style={{ marginTop: 4 }}>
                  {pct(u)}% · {s.darts[u]} darts
                  {s.resets[u].dealt > 0 && ` · ${s.resets[u].dealt} reset${s.resets[u].dealt !== 1 ? "s" : ""} dealt`}
                </div>
                {/* Progress bar */}
                <div
                  style={{
                    marginTop: 6,
                    height: 4,
                    borderRadius: 2,
                    background: "var(--line)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct(u)}%`,
                      height: "100%",
                      background: active ? "var(--accent)" : "var(--muted)",
                      transition: "width 0.2s",
                    }}
                  />
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
            {castActive ? ` · ${s.scores[cur] + turnSum} / ${target}` : ""}
          </span>
          <span
            style={{
              minHeight: 16,
              color: msg.startsWith("BUST") ? "var(--red)" : "var(--amber)",
              fontSize: "calc(12px * var(--fs))",
              fontWeight: 600,
            }}
          >
            {msg}
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
            <button
              key={n}
              className="chip"
              style={{ fontSize: "calc(15px * var(--fs))", padding: "12px 0" }}
              onClick={() => addDart({ n, mult })}
            >
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
