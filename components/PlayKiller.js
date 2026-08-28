import { useState, useEffect } from "react";
import DartBoard from "./DartBoard";
import { dartLabel } from "@/lib/darts";
import { PlayerBadge } from "./ui";

export default function PlayKiller({ game, resume, onProgress, onFinish, onQuit, castActive, playerColors }) {
  const { players, config } = game;
  const numbers = config.numbers; // { [player]: number }
  const startLives = config.lives || 3;

  const blank = () => ({
    lives: players.reduce((o, u) => ((o[u] = startLives), o), {}),
    killer: players.reduce((o, u) => ((o[u] = false), o), {}),
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

  // skip eliminated players
  const alivePlayers = players.filter((u) => s.lives[u] > 0);
  const curIndex = () => {
    if (alivePlayers.length === 0) return 0;
    return turn % alivePlayers.length;
  };
  const cur = alivePlayers[curIndex()] || players[0];

  const addDart = (dart) => {
    if (turnDarts.length >= 3) return;
    setTurnDarts((d) => [...d, dart]);
  };

  const endTurn = () => {
    setHistory((h) => [...h, { s: JSON.parse(JSON.stringify(s)), turn }]);
    const ns = JSON.parse(JSON.stringify(s));

    ns.darts[cur] += turnDarts.length;
    ns.log[cur] = [...ns.log[cur], ...turnDarts];

    for (const d of turnDarts) {
      if (d.n === 0) continue;

      // check if this dart is a double on someone's number
      if (d.mult === 2) {
        // becoming a killer: hit double of own number
        if (d.n === numbers[cur] && !ns.killer[cur]) {
          ns.killer[cur] = true;
          continue;
        }

        // self-hit penalty: killer hits own double
        if (d.n === numbers[cur] && ns.killer[cur]) {
          ns.lives[cur] = Math.max(0, ns.lives[cur] - 1);
          continue;
        }

        // killing: killer hits another player's double
        if (ns.killer[cur]) {
          const victim = players.find((u) => u !== cur && numbers[u] === d.n);
          if (victim && ns.lives[victim] > 0) {
            ns.lives[victim] = Math.max(0, ns.lives[victim] - 1);
          }
        }
      }
    }

    setTurnDarts([]);
    setMult(1);

    const alive = players.filter((u) => ns.lives[u] > 0);
    if (alive.length <= 1) {
      const winner = alive[0] || cur;
      const perPlayer = {};
      players.forEach((u) => {
        perPlayer[u] = {
          dartsThrown: ns.darts[u],
          livesRemaining: ns.lives[u],
          isKiller: ns.killer[u],
          darts: ns.log[u],
        };
      });
      onFinish({
        id: game.id,
        gameType: "killer",
        config,
        players,
        winner,
        perPlayer,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    setS(ns);
    setTurn((t) => t + 1);
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

  const livesDisplay = (n) => {
    const full = Math.max(0, n);
    return Array.from({ length: startLives }, (_, i) => (i < full ? "/" : " ")).join("");
  };

  return (
    <div className="fade">
      <div className="between mb-12">
        <div className="display" style={{ fontSize: "calc(17px * var(--fs))" }}>
          Killer
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
            const dead = s.lives[u] <= 0;
            return (
              <div
                key={u}
                className="card pad-sm"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--line)",
                  background: active ? "var(--accent-soft)" : dead ? "var(--surface)" : "var(--surface)",
                  opacity: dead ? 0.45 : 1,
                }}
              >
                <div className="between">
                  <PlayerBadge username={u} color={playerColors?.[u]} size={20} />
                  {active && <span className="tag" style={{ color: "var(--accent)" }}>at the oche</span>}
                </div>
                <div className="between" style={{ marginTop: 4 }}>
                  <span className="tag">#{numbers[u]}</span>
                  <span
                    className="tag"
                    style={{ color: s.killer[u] ? "var(--red)" : "var(--muted)", fontWeight: 600 }}
                  >
                    {s.killer[u] ? "KILLER" : "not killer"}
                  </span>
                </div>
                <div
                  className="num"
                  style={{
                    fontSize: "calc(28px * var(--fs))",
                    lineHeight: 1.1,
                    marginTop: 4,
                    letterSpacing: 4,
                    color: s.lives[u] <= 1 ? "var(--red)" : "var(--ink)",
                  }}
                >
                  {livesDisplay(s.lives[u])}
                </div>
                <div className="tag" style={{ marginTop: 4 }}>
                  {s.lives[u]} {s.lives[u] === 1 ? "life" : "lives"} · {s.darts[u]} darts
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="between" style={{ marginBottom: 8 }}>
          <span className="tag">
            {cur} — {s.killer[cur] ? "killer" : "become a killer (D" + numbers[cur] + ")"}
            {castActive ? ` · #${numbers[cur]}` : ""}
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

        <div className="row mt-12">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={endTurn}>
            End turn
          </button>
        </div>

        {!castActive && (
          <div style={{ marginTop: 14 }}>
            <DartBoard highlight={[numbers[cur]]} hits={turnDarts} />
          </div>
        )}
      </div>
    </div>
  );
}
