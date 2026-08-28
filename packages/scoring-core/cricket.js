/**
 * Cricket rules, extracted verbatim from components/PlayCricket.js.
 * Standard league MPR: darts that advance closing always count; surplus
 * hits count only while an opponent still has the number open; dead
 * darts count 0 marks. Variants: standard, cutthroat, noscore.
 *
 * Visit darts here are { target: "20".."15"|"B", ring: 1|2|3 } exactly
 * as the manual UI enters them; the generic reducer adapts { n, mult }
 * hardware darts into this shape (bull ring capped at 2, like the UI).
 */
const TARGETS = ["20", "19", "18", "17", "16", "15", "B"];
const VALUE = { 20: 20, 19: 19, 18: 18, 17: 17, 16: 16, 15: 15, B: 25 };
const numOf = (t) => (t === "B" ? 25 : Number(t));

export function createCricketEngine(players) {
  return players.reduce((o, u) => {
    o[u] = {
      marks: { 20: 0, 19: 0, 18: 0, 17: 0, 16: 0, 15: 0, B: 0 },
      points: 0,
      markCount: 0,
      rounds: 0,
      roundMarks: [],
      log: [],
    };
    return o;
  }, {});
}

/**
 * Map a generic { n, mult } dart to a cricket visit entry. Off-target
 * numbers and misses become { target: null, n, mult }: they can never
 * score, but they occupy a visit slot and keep their real location in
 * the log — so a hardware visit of three 12s still advances the turn on
 * removal, and the dart data survives for analytics (guide §10.4).
 */
export function cricketVisitDart(dart) {
  if (dart.n === 25) return { target: "B", ring: Math.min(dart.mult, 2) };
  const t = String(dart.n);
  if (TARGETS.includes(t)) return { target: t, ring: Math.min(dart.mult, 3) };
  return { target: null, n: dart.n, mult: dart.mult };
}

const allClosed = (marks) => TARGETS.every((t) => marks[t] >= 3);

/** Commit the current visit as one round. Mirrors PlayCricket.endTurn. */
export function cricketCommit(state) {
  const { players } = state;
  const variant = state.config?.variant || "standard";
  const cur = players[state.turn % players.length];
  const ns = JSON.parse(JSON.stringify(state.engine));
  const me = ns[cur];
  if (!me.roundMarks) me.roundMarks = [];
  let roundMarks = 0;

  for (const dt of state.visit) {
    if (dt.target == null) {
      me.log.push({ n: dt.n, mult: dt.mult }); // off-target: logged, 0 marks
      continue;
    }
    const before = me.marks[dt.target];
    const after = before + dt.ring;
    const anyOpen = players.some((o) => o !== cur && ns[o].marks[dt.target] < 3);
    me.marks[dt.target] = after;
    me.log.push({ n: numOf(dt.target), mult: dt.ring });
    const closingHits = Math.min(after, 3) - Math.min(before, 3);
    const scoringHits = Math.max(0, after - 3) - Math.max(0, before - 3);
    const liveScoring = variant !== "noscore" && anyOpen ? scoringHits : 0;
    me.markCount += closingHits + liveScoring;
    roundMarks += closingHits + liveScoring;
    if (scoringHits > 0) {
      const value = VALUE[dt.target] * scoringHits;
      if (variant === "noscore") {
        // no points
      } else if (variant === "cutthroat") {
        players.forEach((o) => {
          if (o !== cur && ns[o].marks[dt.target] < 3) ns[o].points += value;
        });
      } else {
        if (anyOpen) me.points += value;
      }
    }
  }
  me.rounds += 1;
  me.roundMarks.push(roundMarks);

  const history = [...state.history, { engine: JSON.parse(JSON.stringify(state.engine)), turn: state.turn }];
  const base = { ...state, engine: ns, visit: [], history };

  if (variant === "noscore") {
    if (allClosed(ns[cur].marks)) return { ...base, status: "completed", winner: cur };
  } else if (variant === "cutthroat") {
    if (players.some((u) => allClosed(ns[u].marks))) {
      let winner = players[0];
      players.forEach((u) => {
        if (ns[u].points < ns[winner].points) winner = u;
      });
      return { ...base, status: "completed", winner };
    }
  } else {
    const closedAll = allClosed(ns[cur].marks);
    const leads = players.every((u) => u === cur || ns[cur].points >= ns[u].points);
    if (closedAll && leads) return { ...base, status: "completed", winner: cur };
  }
  return { ...base, turn: state.turn + 1 };
}

export function cricketResult(state) {
  const perPlayer = {};
  state.players.forEach((u) => {
    const p = state.engine[u];
    perPlayer[u] = {
      marks: p.markCount,
      rounds: p.rounds,
      roundMarks: p.roundMarks || [],
      mpr: p.rounds ? Math.round((p.markCount / p.rounds) * 100) / 100 : 0,
      pointsScored: p.points,
      darts: p.log,
    };
  });
  return perPlayer;
}
