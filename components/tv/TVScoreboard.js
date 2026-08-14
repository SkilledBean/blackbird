import { X01_TARGETS, BASEBALL_INNINGS } from "@/lib/constants";
import { dartValue, dartLabel, markSymbol } from "@/lib/darts";

const ringLabel = (d) => `${d.ring === 1 ? "S" : d.ring === 2 ? "D" : "T"}${d.target}`;

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

  return (
    <div className="tv-board">
      <TVHeader left={`Cricket · ${variantLabel}`} right={`Round ${round}`} />
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
      <TVTurnStrip
        cur={cur}
        darts={darts.map(ringLabel)}
        hint={darts.length ? "" : "throwing…"}
      />
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
      <div className="tv-x01-grid" style={{ "--tv-players": Math.min(players.length, 4) }}>
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
      <TVTurnStrip
        cur={cur}
        darts={turnDarts.map(dartLabel)}
        hint={turnDarts.length ? `${turnSum} this turn` : "throwing…"}
      />
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
      <TVTurnStrip
        cur={cur}
        darts={turnDarts.map(dartLabel)}
        hint={turnDarts.length ? "" : "throwing…"}
      />
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

function TVTurnStrip({ cur, darts, hint }) {
  return (
    <div className="tv-turn">
      <span className="tv-turn-name">{cur}</span>
      <span className="tv-turn-darts">
        {darts.map((d, i) => (
          <span key={i} className="tv-dart">
            {d}
          </span>
        ))}
        {hint && <span className="tv-muted">{hint}</span>}
      </span>
    </div>
  );
}
