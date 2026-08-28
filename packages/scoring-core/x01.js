/**
 * X01 rules, extracted verbatim from components/PlayX01.js so the pure
 * reducer and the manual UI can never disagree. Busts count thrown darts
 * (position averages record zeros); double-out requires the finishing
 * dart to be a double and busts on a remaining score of 1.
 */
// Same formula as lib/darts.js dartValue — duplicated so this package has
// zero app imports (it gets vendored alone onto the board). A unit test
// asserts the two stay identical.
export const dartValue = (d) => (d.n === 0 ? 0 : d.n === 25 ? 25 * d.mult : d.n * d.mult);

const per = (players, v) => players.reduce((o, u) => ((o[u] = typeof v === "function" ? v() : v), o), {});

export function createX01Engine(players, config) {
  return {
    scores: per(players, config.startScore),
    darts: per(players, 0),
    points: per(players, 0),
    highestTurn: per(players, 0),
    checkout: per(players, 0),
    log: per(players, () => []),
    dartPos: per(players, () => [{ sum: 0, count: 0 }, { sum: 0, count: 0 }, { sum: 0, count: 0 }]),
  };
}

/**
 * Add a dart to the visit. Mirrors PlayX01.addDart: may auto-commit as
 * bust / win / normal. Returns the next full game state.
 */
export function x01AddDart(state, dart) {
  const cur = state.players[state.turn % state.players.length];
  const visit = [...state.visit, dart];
  const rem = state.engine.scores[cur] - visit.reduce((a, d) => a + dartValue(d), 0);

  if (rem < 0) return x01Commit(state, visit, "bust");
  if (rem === 0) {
    if (!state.config.doubleOut || dart.mult === 2) return x01Commit(state, visit, "win");
    return x01Commit(state, visit, "bust");
  }
  if (state.config.doubleOut && rem === 1) return x01Commit(state, visit, "bust");
  if (visit.length === 3) return x01Commit(state, visit, "normal");
  return { ...state, visit, msg: "" };
}

export function x01Commit(state, visit, kind) {
  if (visit.length === 0) return state;
  const cur = state.players[state.turn % state.players.length];
  const sum = visit.reduce((a, d) => a + dartValue(d), 0);
  const scoreBefore = state.engine.scores[cur];
  const ns = JSON.parse(JSON.stringify(state.engine));

  ns.darts[cur] += visit.length;
  ns.log[cur] = [...ns.log[cur], ...visit];
  const counted = kind !== "bust";
  visit.forEach((d, i) => {
    if (i > 2) return;
    ns.dartPos[cur][i].count += 1;
    ns.dartPos[cur][i].sum += counted ? dartValue(d) : 0;
  });
  if (kind !== "bust") {
    ns.scores[cur] = scoreBefore - sum;
    ns.points[cur] += sum;
    ns.highestTurn[cur] = Math.max(ns.highestTurn[cur], sum);
  }

  const history = [...state.history, snapshotOf(state)];

  if (kind === "win") {
    ns.checkout[cur] = scoreBefore;
    return {
      ...state,
      engine: ns,
      visit: [],
      msg: "",
      history,
      status: "completed",
      winner: cur,
    };
  }

  return {
    ...state,
    engine: ns,
    visit: [],
    msg: kind === "bust" ? "Bust — no score" : "",
    history,
    turn: state.turn + 1,
  };
}

export function x01Result(state) {
  const perPlayer = {};
  const e = state.engine;
  state.players.forEach((u) => {
    perPlayer[u] = {
      dartsThrown: e.darts[u],
      pointsScored: e.points[u],
      highestTurn: e.highestTurn[u],
      checkout: u === state.winner ? e.checkout[u] : 0,
      finalScore: e.scores[u],
      darts: e.log[u],
      dartPos: e.dartPos[u],
    };
  });
  return perPlayer;
}

function snapshotOf(state) {
  return { engine: JSON.parse(JSON.stringify(state.engine)), turn: state.turn };
}
