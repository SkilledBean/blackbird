/**
 * Baseball rules, extracted verbatim from components/PlayBaseball.js.
 * Nine innings, target number = inning (continuing 10..20 for extras,
 * wrapping); runs = multipliers on the target; ties go to extra innings.
 * Hardware darts on non-target numbers score zero runs but are kept in
 * the log with their real location (guide §10.4).
 */
export const BASEBALL_INNINGS = 9;

export function createBaseballEngine(players) {
  return players.reduce((o, u) => ((o[u] = { innings: [], total: 0, log: [] }), o), {});
}

export const baseballInning = (turn, playerCount) => Math.floor(turn / playerCount) + 1;
export const baseballTarget = (inning) => ((inning - 1) % 20) + 1;

/** Commit the current visit as one inning. Mirrors PlayBaseball.commitInning. */
export function baseballCommit(state) {
  const { players } = state;
  const n = players.length;
  const cur = players[state.turn % n];
  const inning = baseballInning(state.turn, n);
  const target = baseballTarget(inning);

  const runs = state.visit.reduce((a, d) => a + (d.n === target ? d.mult : 0), 0);
  const ns = JSON.parse(JSON.stringify(state.engine));
  ns[cur].innings = [...ns[cur].innings, runs];
  ns[cur].total += runs;
  ns[cur].log = [...ns[cur].log, ...state.visit];

  const history = [...state.history, { engine: JSON.parse(JSON.stringify(state.engine)), turn: state.turn }];
  const newTurn = state.turn + 1;
  const completedInnings = Math.floor(newTurn / n);
  if (newTurn % n === 0 && completedInnings >= BASEBALL_INNINGS) {
    const max = Math.max(...players.map((u) => ns[u].total));
    const leaders = players.filter((u) => ns[u].total === max);
    if (leaders.length === 1 || n === 1) {
      return {
        ...state,
        engine: ns,
        visit: [],
        history,
        status: "completed",
        winner: leaders[0] || cur,
      };
    }
  }
  return { ...state, engine: ns, visit: [], history, turn: newTurn };
}

export function baseballResult(state) {
  const perPlayer = {};
  state.players.forEach((u) => {
    perPlayer[u] = { runs: state.engine[u].total, darts: state.engine[u].log };
  });
  return perPlayer;
}
