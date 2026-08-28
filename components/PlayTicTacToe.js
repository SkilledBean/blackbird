import { useState, useEffect } from "react";
import DartBoard from "./DartBoard";
import { dartLabel } from "@/lib/darts";

const GRID = [20, 19, 18, 17, 16, 15, 14, 13, 12];
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diags
];

function checkWinner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return null;
}

export default function PlayTicTacToe({ game, resume, onProgress, onFinish, onQuit, castActive }) {
  const { players, config } = game;

  const blank = () => ({
    board: Array(9).fill(null),
    darts: players.reduce((o, u) => ((o[u] = 0), o), {}),
    log: players.reduce((o, u) => ((o[u] = []), o), {}),
  });

  const [s, setS] = useState(() => resume?.s ?? blank());
  const [turn, setTurn] = useState(() => resume?.turn ?? 0);
  const [turnDarts, setTurnDarts] = useState(() => resume?.turnDarts ?? []);
  const [history, setHistory] = useState(() => resume?.history ?? []);

  useEffect(() => {
    onProgress && onProgress({ s, turn, turnDarts, history });
  }, [s, turn, turnDarts, history, onProgress]);

  const cur = players[turn % players.length];
  const opp = players[(turn + 1) % players.length];

  const addDart = (dart) => {
    if (turnDarts.length >= 3) return;
    setTurnDarts((d) => [...d, dart]);
  };
  const removeDart = (i) => setTurnDarts((d) => d.filter((_, idx) => idx !== i));

  const endTurn = () => {
    setHistory((h) => [...h, { s: JSON.parse(JSON.stringify(s)), turn }]);
    const ns = JSON.parse(JSON.stringify(s));
    ns.darts[cur] += turnDarts.length;
    ns.log[cur] = [...ns.log[cur], ...turnDarts];

    for (const dart of turnDarts) {
      const idx = GRID.indexOf(dart.n);
      if (idx === -1) continue; // miss or off-grid
      if (ns.board[idx] === cur) {
        // already ours, no effect
      } else if (ns.board[idx] === opp) {
        // cancel opponent's claim
        ns.board[idx] = null;
      } else {
        // unclaimed, claim it
        ns.board[idx] = cur;
      }
    }

    // Check for winner
    const winner = checkWinner(ns.board);
    if (winner) {
      const perPlayer = {};
      players.forEach((u) => {
        perPlayer[u] = {
          squaresClaimed: ns.board.filter((c) => c === u).length,
          dartsThrown: ns.darts[u],
          darts: ns.log[u],
        };
      });
      onFinish({
        id: game.id,
        gameType: "tictactoe",
        config,
        players,
        winner,
        perPlayer,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    // If all 9 squares are claimed (no nulls) and no winner, reset board
    if (ns.board.every((c) => c !== null)) {
      ns.board = Array(9).fill(null);
    }

    setS(ns);
    setTurnDarts([]);
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

  const p1 = players[0];
  const p2 = players[1];

  const cellColor = (owner) =>
    owner === p1 ? "var(--accent)" : owner === p2 ? "var(--amber)" : "transparent";
  const cellInitial = (owner) =>
    owner ? owner.charAt(0).toUpperCase() : "";

  return (
    <div className="fade">
      <div className="between mb-12">
        <div className="display" style={{ fontSize: "calc(17px * var(--fs))" }}>
          Tic-Tac-Toe
        </div>
        <button className="btn btn-danger" style={{ padding: "7px 12px" }} onClick={onQuit}>
          Quit
        </button>
      </div>

      {!castActive && (
        <div className="card pad-sm mb-12">
          <div className="between" style={{ marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: cur === p1 ? "var(--accent)" : "var(--amber)" }}>
              {cur}'s turn
            </span>
            <span className="tag">
              <span style={{ color: "var(--accent)" }}>{p1}</span>
              {" vs "}
              <span style={{ color: "var(--amber)" }}>{p2}</span>
            </span>
          </div>

          {/* 3x3 grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 6,
              maxWidth: "calc(280px * var(--fs))",
              margin: "0 auto",
            }}
          >
            {GRID.map((num, idx) => {
              const owner = s.board[idx];
              return (
                <div
                  key={idx}
                  style={{
                    aspectRatio: "1",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    border: `2px solid ${owner ? cellColor(owner) : "var(--line)"}`,
                    background: owner ? `${cellColor(owner)}18` : "var(--surface)",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      fontSize: "calc(22px * var(--fs))",
                      fontWeight: 700,
                      color: owner ? cellColor(owner) : "var(--ink)",
                    }}
                  >
                    {num}
                  </div>
                  {owner && (
                    <div
                      style={{
                        fontSize: "calc(11px * var(--fs))",
                        fontWeight: 600,
                        color: cellColor(owner),
                        marginTop: 2,
                      }}
                    >
                      {cellInitial(owner)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="tag" style={{ textAlign: "center", marginTop: 8 }}>
            {p1}: {s.darts[p1]} darts · {p2}: {s.darts[p2]} darts
          </div>
        </div>
      )}

      <div className="card">
        <div className="tag" style={{ marginBottom: 10 }}>
          {cur} — tap a grid number ({turnDarts.length}/3 darts)
        </div>

        <div className="grid-5">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => {
            const onGrid = GRID.includes(n);
            return (
              <button
                key={n}
                className="chip"
                style={{
                  fontSize: "calc(15px * var(--fs))",
                  padding: "12px 0",
                  opacity: onGrid && turnDarts.length < 3 ? 1 : 0.3,
                }}
                disabled={!onGrid || turnDarts.length >= 3}
                onClick={() => addDart({ n, mult: 1 })}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div className="grid-4 mt-12">
          <button className="chip" disabled style={{ opacity: 0.3 }}>25</button>
          <button className="chip" disabled style={{ opacity: 0.3 }}>Bull</button>
          <button className="chip" onClick={() => addDart({ n: 0, mult: 0 })} disabled={turnDarts.length >= 3}>
            Miss
          </button>
          <button className="chip" onClick={undo} disabled={!turnDarts.length && !history.length}>
            Undo
          </button>
        </div>

        <div className="flex-wrap" style={{ marginTop: 10, minHeight: 30 }}>
          {turnDarts.map((d, i) => (
            <button
              key={i}
              className="btn"
              style={{ padding: "5px 10px", fontSize: "calc(13px * var(--fs))" }}
              onClick={() => removeDart(i)}
            >
              {dartLabel(d)} ✕
            </button>
          ))}
          {turnDarts.length === 0 && <span className="tag">no darts entered yet</span>}
        </div>

        <div className="row mt-12">
          <button className="btn" style={{ flex: 1 }} onClick={undo} disabled={!turnDarts.length && !history.length}>
            Undo
          </button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={endTurn}>
            End turn
          </button>
        </div>

        {!castActive && (
          <div style={{ marginTop: 14 }}>
            <DartBoard highlight={GRID} hits={turnDarts} />
          </div>
        )}
      </div>
    </div>
  );
}
