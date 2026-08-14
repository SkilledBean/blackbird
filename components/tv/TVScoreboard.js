import { X01_TARGETS, BASEBALL_INNINGS } from "@/lib/constants";
import { dartValue, markSymbol } from "@/lib/darts";
import DartBoard from "@/components/DartBoard";

const numOf = (t) => (t === "B" ? 25 : Number(t));

/**
 * Big-screen scoreboard rendered on /tv from the phone's broadcast
 * snapshots. Pure function of {game, snapshot} — no local game logic.
 */
export default function TVScoreboard({ game, snapshot }) {
  if (!game || !snapshot) return null;
  if (game.gameType === "cricket") return <TVCricket game={game} snapshot={snapshot} />;
  if (game.gameType === "x01") return <TVX01 game={game} snapshot={snapshot} />;
  if (game.gameType === "baseball") return <TVBaseball game={game} snapshot={snapshot} />;
  return null;
}

function TVCricket({ game, snapshot }) {
  const { players } = game;
  const variant = game.config?.variant || "standard";
  const { state, turn, darts = [] } = snapshot;
  if (!state) return null;
  const cur = players[turn % players.length];
  const round = Math.floor(turn / players.length) + 1;
  const mpr = (u) => (state[u].rounds ? (state[u].markCount / state[u].rounds).toFixed(2) : "—");
  const variantLabel =
    variant === "cutthroat" ? "Cutthroat" : variant === "noscore" ? "No-score" : "Score";
  // same board view as the phone: current player's open numbers glow,
  // this turn's darts are plotted
  const openTargets = X01_TARGETS.filter((t) => state[cur].marks[t] < 3).map(numOf);
  const boardHits = darts.map((d) => ({ n: numOf(d.target), mult: d.ring }));

  return (
    <div className="tv-board">
      <TVHeader left={`Cricket · ${variantLabel}`} right={`Round ${round}`} />
      <div className="tv-split">
        <div className="tv-main">
          <table className="tv-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}></th>
                {X01_TARGETS.map((t) => (
                  <th key={t}>{t}</th>
                ))}
                {variant !== "noscore" && <th>Pts</th>}
                <th>MPR</th>
              </tr>
            </thead>
            <tbody>
              {players.map((u) => (
                <tr key={u} className={u === cur ? "active" : ""}>
                  <td className="tv-name">{u}</td>
                  {X01_TARGETS.map((t) => (
                    <td
                      key={t}
                      className="tv-num"
                      style={{ color: state[u].marks[t] >= 3 ? "var(--accent)" : "var(--ink)" }}
                    >
                      {markSymbol(Math.min(state[u].marks[t], 3))}
                    </td>
                  ))}
                  {variant !== "noscore" && (
                    <td className="tv-num" style={{ color: "var(--amber)" }}>
                      {state[u].points}
                    </td>
                  )}
                  <td className="tv-num tv-muted">{mpr(u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tv-boardwrap">
          <DartBoard highlight={openTargets} hits={boardHits} />
        </div>
      </div>
    </div>
  );
}

function TVX01({ game, snapshot }) {
  const { players, config } = game;
  const { s, turn, turnDarts = [], msg } = snapshot;
  if (!s) return null;
  const cur = players[turn % players.length];
  const turnSum = turnDarts.reduce((a, d) => a + dartValue(d), 0);
  const avg = (u) => (s.darts[u] ? ((s.points[u] / s.darts[u]) * 3).toFixed(1) : "0.0");

  return (
    <div className="tv-board">
      <TVHeader
        left={`${config.startScore} · ${config.doubleOut ? "double out" : "straight out"}`}
        right={msg || ""}
        rightColor={msg ? "var(--red)" : undefined}
      />
      <div className="tv-split">
        <div className="tv-main">
          <div className="tv-x01-grid" style={{ "--tv-players": Math.min(players.length, 2) }}>
            {players.map((u) => {
              const active = u === cur;
              const shown = active ? s.scores[u] - turnSum : s.scores[u];
              return (
                <div key={u} className={`tv-x01-card ${active ? "active" : ""}`}>
                  <div className="tv-x01-name">{u}</div>
                  <div className="tv-x01-score" style={{ color: shown <= 40 ? "var(--red)" : undefined }}>
                    {shown}
                  </div>
                  <div className="tv-x01-sub">
                    avg {avg(u)} · {s.darts[u]} darts
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="tv-boardwrap">
          <DartBoard hits={turnDarts} />
        </div>
      </div>
    </div>
  );
}

function TVBaseball({ game, snapshot }) {
  const { players } = game;
  const { state, turn, turnDarts = [] } = snapshot;
  if (!state) return null;
  const n = players.length;
  const cur = players[turn % n];
  const inning = Math.floor(turn / n) + 1;
  const innings = BASEBALL_INNINGS;
  const target = ((inning - 1) % 20) + 1;
  const colCount = Math.max(inning, innings);
  const cols = Array.from({ length: colCount }, (_, i) => i + 1);

  return (
    <div className="tv-board">
      <TVHeader left="Baseball" right={`Inning ${inning} · aiming at ${target}`} />
      <div className="tv-split">
        <div className="tv-main">
          <table className="tv-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}></th>
                {cols.map((c) => (
                  <th key={c} style={{ color: c === inning ? "var(--accent)" : undefined }}>
                    {c > innings ? "E" : c}
                  </th>
                ))}
                <th>R</th>
              </tr>
            </thead>
            <tbody>
              {players.map((u) => (
                <tr key={u} className={u === cur ? "active" : ""}>
                  <td className="tv-name">{u}</td>
                  {cols.map((c) => (
                    <td key={c} className="tv-num">
                      {state[u].innings[c - 1] != null ? state[u].innings[c - 1] : ""}
                    </td>
                  ))}
                  <td className="tv-num" style={{ color: "var(--amber)" }}>
                    {state[u].total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tv-boardwrap">
          <DartBoard highlight={[target]} hits={turnDarts} />
        </div>
      </div>
    </div>
  );
}

function TVHeader({ left, right, rightColor }) {
  return (
    <div className="tv-header">
      <span>{left}</span>
      <span style={rightColor ? { color: rightColor } : undefined}>{right}</span>
    </div>
  );
}

