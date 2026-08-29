import { useState } from "react";
import { BackBar, PlayerBadge, ShuffleIcon } from "./ui";
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
  const moveFirst = (u) => setSelected((s) => [u, ...s.filter((x) => x !== u)]);

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

        <div className="flex-wrap">
          {selected.length === 0 && <span className="subtle">No players selected yet.</span>}
          {selected.map((u, i) => (
            <button key={u} className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => remove(u)}>
              <span style={{ opacity: 0.6, fontSize: "calc(11px * var(--fs))", minWidth: 14 }}>{i + 1}.</span>
              <PlayerBadge username={u} color={playerColors?.[u]} size={18} showName={false} />
              {u}{u === meName ? " (you)" : ""} ✕
            </button>
          ))}
        </div>

        {selected.length >= 2 && (
          <p className="tag" style={{ marginTop: 8, textTransform: "none", letterSpacing: 0 }}>
            Tap a name below to move them to first throw:
          </p>
        )}
        {selected.length >= 2 && (
          <div className="flex-wrap" style={{ marginTop: 4 }}>
            {selected.map((u, i) => i > 0 ? (
              <button key={u} className="btn" onClick={() => moveFirst(u)} style={{ fontSize: "calc(12px * var(--fs))", padding: "4px 10px" }}>
                {u} &rarr; 1st
              </button>
            ) : null)}
          </div>
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
