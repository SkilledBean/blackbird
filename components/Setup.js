import { useState, useRef, useCallback } from "react";
import { BackBar, PlayerBadge, ShuffleIcon, DragIcon } from "./ui";
import { CRICKET_VARIANTS } from "@/lib/constants";

const KILLER_NUMBERS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];

function assignKillerNumbers(players) {
  const pool = [...KILLER_NUMBERS];
  const out = {};
  for (const p of players) {
    const idx = Math.floor(Math.random() * pool.length);
    out[p] = pool.splice(idx, 1)[0];
  }
  return out;
}

function useDragReorder(selected, setSelected) {
  const dragIdx = useRef(null);
  const overIdx = useRef(null);
  const touchStartY = useRef(null);
  const dragging = useRef(false);

  const reorder = useCallback((from, to) => {
    if (from === to) return;
    setSelected((s) => {
      const a = [...s];
      const [item] = a.splice(from, 1);
      a.splice(to, 0, item);
      return a;
    });
  }, [setSelected]);

  const onDragStart = useCallback((e, i) => {
    dragIdx.current = i;
    dragging.current = true;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(i));
  }, []);

  const onDragOver = useCallback((e, i) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overIdx.current !== i && dragIdx.current !== null) {
      overIdx.current = i;
      reorder(dragIdx.current, i);
      dragIdx.current = i;
    }
  }, [reorder]);

  const onDragEnd = useCallback(() => {
    dragIdx.current = null;
    overIdx.current = null;
    dragging.current = false;
  }, []);

  const pillRefs = useRef([]);

  const onTouchStart = useCallback((e, i) => {
    dragIdx.current = i;
    touchStartY.current = e.touches[0].clientY;
    dragging.current = false;
  }, []);

  const onTouchMove = useCallback((e, i) => {
    if (dragIdx.current === null) return;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    const dx = Math.abs(e.touches[0].clientX - (touchStartY.current || 0));
    if (!dragging.current && (dy > 8 || dx > 8)) dragging.current = true;
    if (!dragging.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const els = pillRefs.current;
    for (let j = 0; j < els.length; j++) {
      if (j === dragIdx.current || !els[j]) continue;
      const rect = els[j].getBoundingClientRect();
      if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
          touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        reorder(dragIdx.current, j);
        dragIdx.current = j;
        break;
      }
    }
  }, [reorder]);

  const onTouchEnd = useCallback((e) => {
    const wasDrag = dragging.current;
    dragIdx.current = null;
    dragging.current = false;
    touchStartY.current = null;
    return wasDrag;
  }, []);

  return { onDragStart, onDragOver, onDragEnd, onTouchStart, onTouchMove, onTouchEnd, pillRefs };
}

export default function Setup({ players, onStart, back, me, playerColors }) {
  const meName = (me || "").trim();
  const [selected, setSelected] = useState(meName ? [meName] : []);
  const [gameType, setGameType] = useState("x01");
  const [startScore, setStartScore] = useState(501);
  const [doubleOut, setDoubleOut] = useState(true);
  const [legs, setLegs] = useState(1);
  const [variant, setVariant] = useState("standard");
  const [shanghaiMode, setShanghaiMode] = useState("beginner");
  const [gotchaTarget, setGotchaTarget] = useState(301);
  const [killerLives, setKillerLives] = useState(3);

  const add = (u) => setSelected((s) => (s.length < 4 && !s.includes(u) ? [...s, u] : s));
  const remove = (u) => setSelected((s) => s.filter((x) => x !== u));
  const shuffle = () => setSelected((s) => {
    const a = [...s];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  });

  const { onDragStart, onDragOver, onDragEnd, onTouchStart, onTouchMove, onTouchEnd, pillRefs } = useDragReorder(selected, setSelected);

  const anyLinked = players.some((p) => p.authId);
  const eligible = anyLinked
    ? players.filter((p) => p.authId).map((p) => p.username)
    : players.map((p) => p.username);

  const rosterOptions = eligible.filter((u) => !selected.includes(u));

  const solo = selected.length === 1;
  const needsTwo = gameType === "tictactoe" || gameType === "killer" || gameType === "gotcha";
  const exactTwo = gameType === "tictactoe";
  const canStart = exactTwo ? selected.length === 2 : needsTwo ? selected.length >= 2 : selected.length >= 1;

  const start = () => {
    let config = {};
    if (gameType === "x01") config = { startScore, doubleOut, legs };
    else if (gameType === "cricket") config = { variant };
    else if (gameType === "shanghai") config = { mode: shanghaiMode };
    else if (gameType === "gotcha") config = { targetScore: gotchaTarget };
    else if (gameType === "killer") config = { numbers: assignKillerNumbers(selected), lives: killerLives };
    onStart({
      id: Date.now().toString(36),
      gameType,
      players: selected,
      config,
      startedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fade">
      <BackBar back={back} title="New Game" />

      <div className="card mb-12">
        <div className="tag mb-12">Game Type</div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {[
            ["x01", "X01"],
            ["cricket", "Cricket"],
            ["baseball", "Baseball"],
            ["aroundTheClock", "Around the Clock"],
            ["killer", "Killer"],
            ["shanghai", "Shanghai"],
            ["halveit", "Halve It"],
            ["gotcha", "Gotcha"],
            ["tictactoe", "Tic-Tac-Toe"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={`btn ${gameType === k ? "btn-primary" : ""}`}
              style={{ flex: "1 1 30%" }}
              onClick={() => setGameType(k)}
            >
              {l}
            </button>
          ))}
        </div>

        {gameType === "x01" && (
          <div className="mt-12">
            <div className="tag" style={{ marginBottom: 6 }}>
              Starting Score
            </div>
            <div className="row">
              {[301, 501, 701].map((v) => (
                <button
                  key={v}
                  className={`btn ${startScore === v ? "btn-toggle-on" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => setStartScore(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={doubleOut}
                onChange={(e) => setDoubleOut(e.target.checked)}
              />
              <span>Double out (finish on exactly 0; can&apos;t leave 1)</span>
            </label>
            <div className="tag" style={{ marginTop: 12, marginBottom: 6 }}>Legs</div>
            <div className="row">
              {[1, 3, 5, 7].map((v) => (
                <button
                  key={v}
                  className={`btn ${legs === v ? "btn-toggle-on" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => setLegs(v)}
                >
                  {v === 1 ? "Single" : `Best of ${v}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameType === "cricket" && (
          <div className="mt-12">
            <div className="tag" style={{ marginBottom: 6 }}>
              Variant
            </div>
            <div className="row">
              {CRICKET_VARIANTS.map((v) => (
                <button
                  key={v.id}
                  className={`btn ${variant === v.id ? "btn-toggle-on" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => setVariant(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className="tag" style={{ marginTop: 8, textTransform: "none", letterSpacing: 0 }}>
              {variant === "standard" && "Close all numbers and lead on points to win."}
              {variant === "cutthroat" && "Points go to opponents — lowest score wins."}
              {variant === "noscore" && "First to close all numbers wins. Points ignored."}
            </p>
          </div>
        )}

        {gameType === "baseball" && (
          <p className="tag mt-12" style={{ textTransform: "none", letterSpacing: 0 }}>
            9 innings. In inning N you aim at number N; single/double/triple = 1/2/3 runs.
            Most runs after 9 innings wins.
          </p>
        )}

        {gameType === "aroundTheClock" && (
          <p className="tag mt-12" style={{ textTransform: "none", letterSpacing: 0 }}>
            Hit numbers 1 through 20, then Bull, in order. First to finish wins.
            Any multiplier counts (single, double, or triple).
          </p>
        )}

        {gameType === "killer" && (
          <div className="mt-12">
            <div className="tag" style={{ marginBottom: 6 }}>Lives</div>
            <div className="row">
              {[3, 5, 7].map((v) => (
                <button
                  key={v}
                  className={`btn ${killerLives === v ? "btn-toggle-on" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => setKillerLives(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="tag" style={{ marginTop: 8, textTransform: "none", letterSpacing: 0 }}>
              Each player gets a random number. Hit your own double to become a killer,
              then hit opponents&apos; doubles to take their lives. Last one standing wins.
            </p>
          </div>
        )}

        {gameType === "shanghai" && (
          <div className="mt-12">
            <div className="tag" style={{ marginBottom: 6 }}>Mode</div>
            <div className="row">
              {[
                ["beginner", "Beginner (1-7)"],
                ["advanced", "Advanced (15-20+Bull)"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={`btn ${shanghaiMode === k ? "btn-toggle-on" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => setShanghaiMode(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="tag" style={{ marginTop: 8, textTransform: "none", letterSpacing: 0 }}>
              7 rounds on sequential targets. Only darts hitting the round&apos;s target score.
              Hit single + double + triple of the target in one turn for an instant Shanghai win.
            </p>
          </div>
        )}

        {gameType === "halveit" && (
          <p className="tag mt-12" style={{ textTransform: "none", letterSpacing: 0 }}>
            9 rounds with fixed targets (20, 19, 18, any double, 17, 16, 15, any triple, Bull).
            Start at 40. Miss all 3 darts and your score is halved. Highest score wins.
          </p>
        )}

        {gameType === "gotcha" && (
          <div className="mt-12">
            <div className="tag" style={{ marginBottom: 6 }}>Target Score</div>
            <div className="row">
              {[301, 501].map((v) => (
                <button
                  key={v}
                  className={`btn ${gotchaTarget === v ? "btn-toggle-on" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => setGotchaTarget(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="tag" style={{ marginTop: 8, textTransform: "none", letterSpacing: 0 }}>
              Race to the target. Exceed it and you bust. Land on an opponent&apos;s exact score
              to reset them to 0.
            </p>
          </div>
        )}

        {gameType === "tictactoe" && (
          <p className="tag mt-12" style={{ textTransform: "none", letterSpacing: 0 }}>
            2-player only. A 3x3 grid of numbers (20 down to 12). Hit an unclaimed square to
            claim it; hit an opponent&apos;s square to cancel it. Three in a row wins.
          </p>
        )}
      </div>

      <div className="card mb-12">
        <div className="tag mb-12" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Players ({exactTwo ? "exactly 2" : needsTwo ? "2-4" : "1 = solo practice, up to 4"})</span>
          {selected.length >= 2 && (
            <button className="btn" onClick={shuffle} style={{ padding: "4px 10px", fontSize: "calc(11px * var(--fs))", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <ShuffleIcon /> Shuffle
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {selected.length === 0 && <span className="subtle">No players selected yet.</span>}
          {selected.map((u, i) => (
            <div
              key={u}
              ref={(el) => { pillRefs.current[i] = el; }}
              draggable={selected.length >= 2}
              onDragStart={(e) => onDragStart(e, i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDragEnd={onDragEnd}
              onTouchStart={(e) => onTouchStart(e, i)}
              onTouchMove={(e) => onTouchMove(e, i)}
              onTouchEnd={(e) => {
                const wasDrag = onTouchEnd(e);
                if (wasDrag) e.preventDefault();
              }}
              className="btn btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                cursor: selected.length >= 2 ? "grab" : "default",
                userSelect: "none",
                touchAction: selected.length >= 2 ? "none" : "auto",
              }}
            >
              {selected.length >= 2 && (
                <span style={{ opacity: 0.5, flex: "none", display: "flex" }}>
                  <DragIcon />
                </span>
              )}
              <span style={{ opacity: 0.6, fontSize: "calc(11px * var(--fs))", minWidth: 16, flex: "none" }}>{i + 1}.</span>
              <PlayerBadge username={u} color={playerColors?.[u]} size={20} showName={false} />
              <span style={{ flex: 1 }}>{u}{u === meName ? " (you)" : ""}</span>
              <button
                onClick={(e) => { e.stopPropagation(); remove(u); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  padding: "2px 4px",
                  opacity: 0.7,
                  fontSize: "calc(14px * var(--fs))",
                  flex: "none",
                }}
                aria-label={`Remove ${u}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {selected.length >= 2 && (
          <p className="tag" style={{ marginTop: 8, textTransform: "none", letterSpacing: 0 }}>
            Drag to reorder. Player 1 throws first.
          </p>
        )}

        {rosterOptions.length > 0 && selected.length < (exactTwo ? 2 : 4) && (
          <select
            className="select mt-12"
            value=""
            onChange={(e) => {
              if (e.target.value) add(e.target.value);
            }}
          >
            <option value="">+ Add a player…</option>
            {rosterOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
        {rosterOptions.length === 0 && selected.length < (exactTwo ? 2 : 4) && (
          <p className="tag mt-12" style={{ textTransform: "none", letterSpacing: 0 }}>
            No other players available. Players need a login account to appear here.
          </p>
        )}

        {solo && !needsTwo && (
          <p className="tag" style={{ marginTop: 10, color: "var(--amber)", textTransform: "none", letterSpacing: 0 }}>
            Solo practice — this game won&apos;t be saved to stats or the leaderboard.
          </p>
        )}
      </div>

      <button
        className="btn btn-primary"
        disabled={!canStart}
        style={{ width: "100%", fontSize: "calc(15px * var(--fs))", padding: 15 }}
        onClick={start}
      >
        {canStart ? (solo && !needsTwo ? "Start practice" : "Throw first") : exactTwo ? "Pick exactly 2 players" : needsTwo ? "Pick at least 2 players" : "Pick at least 1 player"}
      </button>
    </div>
  );
}
