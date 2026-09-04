import { useState, useEffect } from "react";
import DartBoard from "./DartBoard";
import { dartLabel } from "@/lib/darts";
import Celebration from "./Celebration";
import { PlayerBadge, UndoIcon } from "./ui";

const BEGINNER_TARGETS = [1, 2, 3, 4, 5, 6, 7];
const ADVANCED_TARGETS = [15, 16, 17, 18, 19, 20, 25];

export default function PlayShanghai({ game, resume, onProgress, onFinish, onQuit, castActive, playerColors }) {
  const { players, config } = game;
  const mode = config.mode || "beginner";
  const targets = mode === "advanced" ? ADVANCED_TARGETS : BEGINNER_TARGETS;
  const totalRounds = targets.length;

  const blank = () => ({
    scores: players.reduce((o, u) => ((o[u] = 0), o), {}),
    roundScores: players.reduce((o, u) => ((o[u] = []), o), {}),
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
  const roundIndex = Math.floor(turn / players.length);
  const roundNum = roundIndex + 1;
  const target = roundIndex < targets.length ? targets[roundIndex] : targets[targets.length - 1];

  const isShanghai = (darts) => {
    const onTarget = darts.filter((d) => d.n === target);
    const hasSingle = onTarget.some((d) => d.mult === 1);
    const hasDouble = onTarget.some((d) => d.mult === 2);
    const hasTriple = onTarget.some((d) => d.mult === 3);
    return hasSingle && hasDouble && hasTriple;
  };

  const commit = (darts) => {
    setHistory((h) => [...h, { s: JSON.parse(JSON.stringify(s)), turn }]);
    const ns = JSON.parse(JSON.stringify(s));
    ns.darts[cur] += darts.length;
    ns.log[cur] = [...ns.log[cur], ...darts];

    let roundScore = 0;
    for (const d of darts) {
      if (d.n === target) {
        roundScore += d.n * d.mult;
      }
    }
    ns.scores[cur] += roundScore;
    ns.roundScores[cur] = [...ns.roundScores[cur], roundScore];

    setTurnDarts([]);
    setMult(1);

    // check Shanghai instant win
    if (isShanghai(darts)) {
      setCeleb({ type: "shanghai" });
      const perPlayer = {};
      players.forEach((u) => {
        perPlayer[u] = {
          totalScore: ns.scores[u],
          roundScores: ns.roundScores[u],
          dartsThrown: ns.darts[u],
          shanghai: u === cur,
          darts: ns.log[u],
        };
      });
      onFinish({
        id: game.id,
        gameType: "shanghai",
        config,
        players,
        winner: cur,
        perPlayer,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    // check end of game (all rounds complete)
    const newTurn = turn + 1;
    const completedRounds = Math.floor(newTurn / players.length);
    if (newTurn % players.length === 0 && completedRounds >= totalRounds) {
      let winner = players[0];
      players.forEach((u) => {
        if (ns.scores[u] > ns.scores[winner]) winner = u;
      });
      const perPlayer = {};
      players.forEach((u) => {
        perPlayer[u] = {
          totalScore: ns.scores[u],
          roundScores: ns.roundScores[u],
          dartsThrown: ns.darts[u],
          shanghai: false,
          darts: ns.log[u],
        };
      });
      onFinish({
        id: game.id,
        gameType: "shanghai",
        config,
        players,
        winner,
        perPlayer,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    setS(ns);
    setMsg(isShanghai(darts) ? "SHANGHAI!" : "");
    setTurn(newTurn);
  };

  const addDart = (dart) => {
    const next = [...turnDarts, dart];
    if (next.length === 3) return commit(next);
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

  // live scoring for current turn
  const liveRoundScore = turnDarts.reduce(
    (a, d) => a + (d.n === target ? d.n * d.mult : 0),
    0
  );

  // detect partial shanghai in current darts
  const shanghaiCheck = () => {
    const onTarget = turnDarts.filter((d) => d.n === target);
    const hasSingle = onTarget.some((d) => d.mult === 1);
    const hasDouble = onTarget.some((d) => d.mult === 2);
    const hasTriple = onTarget.some((d) => d.mult === 3);
    return hasSingle && hasDouble && hasTriple;
  };

  return (
    <div className="fade">
      {celeb && <Celebration type={celeb.type} label={celeb.label} onDone={() => setCeleb(null)} />}
      <div className="between mb-12">
        <div>
          <div className="display" style={{ fontSize: "calc(17px * var(--fs))" }}>
            Shanghai · {mode === "advanced" ? "Advanced" : "Beginner"}
          </div>
          <div className="tag" style={{ marginTop: 2 }}>
            Round {roundNum} of {totalRounds} — target: {target === 25 ? "Bull" : target}
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
                  {active && <span className="tag" style={{ color: "var(--accent)" }}>at the oche</span>}
                </div>
                <div
                  className="num"
                  style={{ fontSize: "calc(44px * var(--fs))", lineHeight: 1.05, marginTop: 2 }}
                >
                  {active ? s.scores[u] + liveRoundScore : s.scores[u]}
                </div>
                <div className="tag" style={{ marginTop: 4 }}>
                  {s.roundScores[u].length} rounds · {s.darts[u]} darts
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
            {castActive ? ` · target ${target === 25 ? "Bull" : target}` : ""}
          </span>
          <span style={{ minHeight: 16 }}>
            {shanghaiCheck() && (
              <span style={{ color: "var(--amber)", fontSize: "calc(14px * var(--fs))", fontWeight: 700 }}>
                SHANGHAI!
              </span>
            )}
            {msg && !shanghaiCheck() && (
              <span style={{ color: "var(--amber)", fontSize: "calc(12px * var(--fs))", fontWeight: 600 }}>
                {msg}
              </span>
            )}
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
            <button key={n} className="chip" style={{ fontSize: "calc(15px * var(--fs))", padding: "12px 0" }} onClick={() => addDart({ n, mult })}>
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
            <DartBoard highlight={[target]} hits={turnDarts} />
          </div>
        )}
      </div>
    </div>
  );
}
