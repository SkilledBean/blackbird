import { useState, useEffect } from "react";
import DartBoard from "./DartBoard";
import { dartValue, dartLabel } from "@/lib/darts";
import Celebration from "./Celebration";
import { PlayerBadge, UndoIcon } from "./ui";

const TARGETS = [20, 19, 18, "D", 17, 16, 15, "T", "B"];

const targetLabel = (t) =>
  t === "D" ? "Any Double" : t === "T" ? "Any Triple" : t === "B" ? "Bull" : String(t);

function hitsTarget(dart, target) {
  if (dart.n === 0) return false;
  if (typeof target === "number") return dart.n === target;
  if (target === "D") return dart.mult === 2;
  if (target === "T") return dart.mult === 3;
  if (target === "B") return dart.n === 25;
  return false;
}

function scoreDart(dart, target) {
  if (!hitsTarget(dart, target)) return 0;
  if (typeof target === "number") return dart.n * dart.mult;
  if (target === "D") return dart.n * 2;
  if (target === "T") return dart.n * 3;
  if (target === "B") return 25 * dart.mult;
  return 0;
}

export default function PlayHalveIt({ game, resume, onProgress, onFinish, onQuit, castActive, playerColors }) {
  const { players, config } = game;

  const blank = () => ({
    scores: players.reduce((o, u) => ((o[u] = 40), o), {}),
    halves: players.reduce((o, u) => ((o[u] = 0), o), {}),
    darts: players.reduce((o, u) => ((o[u] = 0), o), {}),
    log: players.reduce((o, u) => ((o[u] = []), o), {}),
  });

  const [s, setS] = useState(() => resume?.s ?? blank());
  const [turn, setTurn] = useState(() => resume?.turn ?? 0);
  const [turnDarts, setTurnDarts] = useState(() => resume?.turnDarts ?? []);
  const [mult, setMult] = useState(() => resume?.mult ?? 1);
  const [msg, setMsg] = useState(() => resume?.msg ?? "");
  const [history, setHistory] = useState(() => resume?.history ?? []);
  const [celeb, setCeleb] = useState(null);

  useEffect(() => {
    onProgress && onProgress({ s, turn, turnDarts, mult, msg, history });
  }, [s, turn, turnDarts, mult, msg, history, onProgress]);

  const cur = players[turn % players.length];
  const round = Math.floor(turn / players.length) + 1;
  const target = TARGETS[round - 1]; // rounds 1-9

  const commit = (darts) => {
    setHistory((h) => [...h, { s: JSON.parse(JSON.stringify(s)), turn }]);
    const ns = JSON.parse(JSON.stringify(s));
    ns.darts[cur] += darts.length;
    ns.log[cur] = [...ns.log[cur], ...darts];

    let turnScore = 0;
    let anyHit = false;
    for (const d of darts) {
      const pts = scoreDart(d, target);
      if (pts > 0) anyHit = true;
      turnScore += pts;
    }

    let halved = false;
    if (!anyHit) {
      ns.scores[cur] = Math.floor(ns.scores[cur] / 2);
      ns.halves[cur] += 1;
      halved = true;
      setCeleb({ type: "halved" });
    } else {
      ns.scores[cur] += turnScore;
    }

    setTurnDarts([]);
    setMult(1);

    // Check if game is over (round 9 complete for all players)
    const newTurn = turn + 1;
    const completedRounds = Math.floor(newTurn / players.length);
    if (newTurn % players.length === 0 && completedRounds >= 9) {
      const max = Math.max(...players.map((u) => ns[u] !== undefined ? ns.scores[u] : 0));
      const leaders = players.filter((u) => ns.scores[u] === max);
      const winner = leaders[0];
      const perPlayer = {};
      players.forEach((u) => {
        perPlayer[u] = {
          finalScore: ns.scores[u],
          halves: ns.halves[u],
          dartsThrown: ns.darts[u],
          darts: ns.log[u],
        };
      });
      onFinish({
        id: game.id,
        gameType: "halveit",
        config,
        players,
        winner,
        perPlayer,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    setS(ns);
    setMsg(halved ? "HALVED!" : turnScore > 0 ? `+${turnScore}` : "");
    setTurn(newTurn);
  };

  const addDart = (dart) => {
    const next = [...turnDarts, dart];
    if (next.length === 3) return commit(next);
    setMsg("");
    setTurnDarts(next);
    setMult(1); // back to Single after every dart — a stuck Double/Triple is the easiest way to mis-score
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

  // Highlight the target number on the dartboard when applicable
  const highlight =
    typeof target === "number"
      ? [target]
      : target === "B"
        ? [25]
        : [];

  return (
    <div className="fade">
      {celeb && <Celebration type={celeb.type} label={celeb.label} onDone={() => setCeleb(null)} />}
      <div className="between mb-12">
        <div>
          <div className="display" style={{ fontSize: "calc(17px * var(--fs))" }}>
            Halve It
          </div>
          <div className="tag" style={{ marginTop: 2 }}>
            Round {round} of 9
          </div>
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
                  <PlayerBadge username={u} color={playerColors?.[u]} size={20} />
                  {active && <span className="tag" style={{ color: "var(--accent)" }}>throwing</span>}
                </div>
                <div
                  className="num"
                  style={{ fontSize: "calc(44px * var(--fs))", lineHeight: 1.05, marginTop: 2 }}
                >
                  {s.scores[u]}
                </div>
                <div className="tag" style={{ marginTop: 4 }}>
                  halved {s.halves[u]}x · {s.darts[u]} darts
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
          </span>
          <span
            style={{
              minHeight: 16,
              color: msg === "HALVED!" ? "var(--red)" : "var(--accent)",
              fontSize: "calc(12px * var(--fs))",
              fontWeight: 600,
            }}
          >
            {msg}
          </span>
        </div>

        <div
          style={{
            textAlign: "center",
            fontSize: "calc(22px * var(--fs))",
            fontWeight: 700,
            padding: "8px 0",
            marginBottom: 8,
            color: "var(--amber)",
          }}
        >
          Target: {targetLabel(target)}
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
              className={`btn ${mult === m ? "btn-primary" : ""}`}
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

        <div className="grid-3 mt-12">
          <button className="chip" onClick={() => addDart({ n: 25, mult: 1 })}>25</button>
          <button className="chip" onClick={() => addDart({ n: 25, mult: 2 })}>Bull</button>
          <button className="chip" onClick={() => addDart({ n: 0, mult: 0 })}>Miss</button>
        </div>
        <button className="chip chip-undo" onClick={undo} disabled={!turnDarts.length && !history.length}>
          <UndoIcon /> Undo
        </button>

        {!castActive && (
          <div style={{ marginTop: 14 }}>
            <DartBoard highlight={highlight} hits={turnDarts} />
          </div>
        )}
      </div>
    </div>
  );
}
