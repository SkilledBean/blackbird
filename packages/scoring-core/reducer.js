/**
 * Pure, deterministic scoring reducer shared by the web UI, the future
 * Prodigy hardware bridge, and replay/recovery. No clock, no randomness,
 * no I/O — state in, state out. (docs/prodigy-development-guide.md §17.1)
 *
 * const s0 = createGame({ gameType, players, config });
 * const s1 = applyGameEvent(s0, { type: "game.dart", dart: { n: 20, mult: 3 } });
 * const json = serializeGame(s1);      const back = deserializeGame(json);
 * const match = deriveCompletedResult(s1, completedAtIso);
 */
import { GameEvent } from "./events.js";
import { isLegalDart } from "./validation.js";
import { createX01Engine, x01AddDart, x01Commit, x01Result } from "./x01.js";
import { createCricketEngine, cricketVisitDart, cricketCommit, cricketResult } from "./cricket.js";
import { createBaseballEngine, baseballCommit, baseballResult } from "./baseball.js";

export const SCORING_CORE_VERSION = "1.0.0";
const SCHEMA = 1;

export function createGame({ gameType, players, config = {} }) {
  if (!Array.isArray(players) || players.length === 0) throw new Error("players required");
  let engine;
  if (gameType === "x01") {
    if (!Number.isInteger(config.startScore) || config.startScore <= 0) throw new Error("x01 startScore required");
    engine = createX01Engine(players, config);
  } else if (gameType === "cricket") {
    engine = createCricketEngine(players);
  } else if (gameType === "baseball") {
    engine = createBaseballEngine(players);
  } else {
    throw new Error(`unknown gameType: ${gameType}`);
  }
  return {
    schema: SCHEMA,
    coreVersion: SCORING_CORE_VERSION,
    gameType,
    players: [...players],
    config: { ...config },
    engine,
    turn: 0,
    visit: [],
    msg: "",
    history: [],
    status: "active",
    winner: null,
  };
}

export function applyGameEvent(state, event) {
  if (!event || typeof event.type !== "string") return state;
  if (state.status === "abandoned") return state; // terminal — undo included
  if (state.status !== "active" && event.type !== GameEvent.UNDO) return state;

  switch (event.type) {
    case GameEvent.DART:
      return applyDart(state, event.dart);
    case GameEvent.END_TURN:
      return commitVisit(state, { allowEmpty: true });
    case GameEvent.REMOVE_DARTS:
      // physical removal with an empty visit is an unexpected reset: no-op
      return state.visit.length ? commitVisit(state, { allowEmpty: false }) : state;
    case GameEvent.UNDO:
      return applyUndo(state);
    case GameEvent.ABANDON:
      return { ...state, status: "abandoned" };
    default:
      return state; // unknown events never crash the reducer
  }
}

function applyDart(state, dart) {
  if (!isLegalDart(dart)) return state;
  if (state.gameType === "x01") {
    return x01AddDart(state, { n: dart.n, mult: dart.mult });
  }
  if (state.gameType === "cricket") {
    if (state.visit.length >= 3) return state;
    return { ...state, visit: [...state.visit, cricketVisitDart(dart)] };
  }
  if (state.gameType === "baseball") {
    if (state.visit.length >= 3) return state;
    const visit = [...state.visit, { n: dart.n, mult: dart.mult }];
    const next = { ...state, visit };
    return visit.length === 3 ? baseballCommit(next) : next;
  }
  return state;
}

function commitVisit(state, { allowEmpty }) {
  if (state.gameType === "x01") {
    return state.visit.length ? x01Commit(state, state.visit, "normal") : state;
  }
  if (state.gameType === "cricket") {
    // the manual UI allows "End turn" with no darts (a zero-mark round)
    return state.visit.length || allowEmpty ? cricketCommit(state) : state;
  }
  if (state.gameType === "baseball") {
    return state.visit.length || allowEmpty ? baseballCommit(state) : state;
  }
  return state;
}

function applyUndo(state) {
  if (state.visit.length > 0) {
    return { ...state, visit: state.visit.slice(0, -1) };
  }
  if (!state.history.length) return state;
  const last = state.history[state.history.length - 1];
  return {
    ...state,
    engine: JSON.parse(JSON.stringify(last.engine)),
    turn: last.turn,
    history: state.history.slice(0, -1),
    visit: [],
    msg: "",
    status: "active",
    winner: null,
  };
}

export function currentPlayer(state) {
  return state.players[state.turn % state.players.length];
}

export function serializeGame(state) {
  return JSON.stringify(state);
}

export function deserializeGame(json) {
  const state = typeof json === "string" ? JSON.parse(json) : json;
  if (state?.schema !== SCHEMA) throw new Error("unsupported scoring-core schema");
  return state;
}

/**
 * Build the match object the app persists (page.js finishMatch contract).
 * completedAt is injected — the reducer itself is clock-free.
 */
export function deriveCompletedResult(state, completedAt, id = null) {
  if (state.status !== "completed" || !state.winner) return null;
  const perPlayer =
    state.gameType === "x01"
      ? x01Result(state)
      : state.gameType === "cricket"
        ? cricketResult(state)
        : baseballResult(state);
  return {
    id,
    gameType: state.gameType,
    config: state.config,
    players: state.players,
    winner: state.winner,
    perPlayer,
    completedAt,
  };
}
