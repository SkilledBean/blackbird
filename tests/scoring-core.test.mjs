import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  applyGameEvent,
  currentPlayer,
  serializeGame,
  deserializeGame,
  deriveCompletedResult,
  GameEvent,
} from "../packages/scoring-core/index.js";
import { dartValue as coreDartValue } from "../packages/scoring-core/x01.js";

const dart = (n, mult) => ({ type: GameEvent.DART, dart: { n, mult } });
const endTurn = { type: GameEvent.END_TURN };
const removeDarts = { type: GameEvent.REMOVE_DARTS };
const undo = { type: GameEvent.UNDO };

const play = (state, events) => events.reduce(applyGameEvent, state);

// ---------------------------------------------------------------- X01

test("x01: scoring, auto-commit on third dart, turn advance", () => {
  let s = createGame({ gameType: "x01", players: ["A", "B"], config: { startScore: 501, doubleOut: true } });
  s = play(s, [dart(20, 3), dart(20, 3), dart(5, 3)]); // 135
  assert.equal(s.engine.scores.A, 366);
  assert.equal(s.engine.points.A, 135);
  assert.equal(s.engine.highestTurn.A, 135);
  assert.equal(s.engine.darts.A, 3);
  assert.equal(currentPlayer(s), "B");
  assert.deepEqual(s.engine.dartPos.A.map((p) => p.sum), [60, 60, 15]);
});

test("x01: bust restores score, counts darts, zeroes positions", () => {
  let s = createGame({ gameType: "x01", players: ["A"], config: { startScore: 32, doubleOut: true } });
  s = play(s, [dart(20, 3)]); // 32 - 60 < 0 → bust on first dart
  assert.equal(s.engine.scores.A, 32);
  assert.equal(s.engine.darts.A, 1);
  assert.equal(s.engine.points.A, 0);
  assert.equal(s.engine.dartPos.A[0].count, 1);
  assert.equal(s.engine.dartPos.A[0].sum, 0);
  assert.equal(s.msg, "Bust — no score");
  assert.equal(s.status, "active");
});

test("x01 double-out: remaining 1 busts; non-double finish busts; double wins", () => {
  let s = createGame({ gameType: "x01", players: ["A"], config: { startScore: 40, doubleOut: true } });
  const leftOne = applyGameEvent(s, dart(13, 3)); // 40-39 = 1 → bust
  assert.equal(leftOne.engine.scores.A, 40);

  const single = applyGameEvent(s, dart(20, 2)); // finish on a double → win
  assert.equal(single.status, "completed");
  assert.equal(single.winner, "A");
  assert.equal(single.engine.checkout.A, 40);
  assert.equal(single.engine.scores.A, 0);

  let s2 = createGame({ gameType: "x01", players: ["A"], config: { startScore: 40, doubleOut: true } });
  s2 = play(s2, [dart(20, 1), dart(20, 1)]); // reach 0 on a single → bust
  assert.equal(s2.engine.scores.A, 40);
  assert.equal(s2.status, "active");
});

test("x01 straight-out: any finish wins; result shape matches the app", () => {
  let s = createGame({ gameType: "x01", players: ["A", "B"], config: { startScore: 61, doubleOut: false } });
  s = play(s, [dart(20, 3), dart(1, 1)]); // A: 61-60-1 = 0 win on 2nd dart
  assert.equal(s.status, "completed");
  const match = deriveCompletedResult(s, "2026-01-01T00:00:00.000Z");
  assert.equal(match.winner, "A");
  assert.equal(match.perPlayer.A.dartsThrown, 2);
  assert.equal(match.perPlayer.A.checkout, 61);
  assert.equal(match.perPlayer.A.finalScore, 0);
  assert.equal(match.perPlayer.B.checkout, 0);
  assert.deepEqual(match.perPlayer.A.darts, [{ n: 20, mult: 3 }, { n: 1, mult: 1 }]);
});

test("x01: end-turn commits a partial visit (hardware removal path)", () => {
  let s = createGame({ gameType: "x01", players: ["A", "B"], config: { startScore: 501, doubleOut: true } });
  s = play(s, [dart(20, 1), removeDarts]);
  assert.equal(s.engine.scores.A, 481);
  assert.equal(s.engine.darts.A, 1);
  assert.equal(currentPlayer(s), "B");
});

test("x01 undo: pops visit dart, then restores committed turn", () => {
  let s = createGame({ gameType: "x01", players: ["A", "B"], config: { startScore: 501, doubleOut: true } });
  s = play(s, [dart(20, 1), dart(20, 1)]);
  s = applyGameEvent(s, undo);
  assert.equal(s.visit.length, 1);
  s = play(s, [dart(20, 1), dart(20, 1)]); // commit 60
  assert.equal(s.engine.scores.A, 441);
  s = applyGameEvent(s, undo); // restore whole turn
  assert.equal(s.engine.scores.A, 501);
  assert.equal(currentPlayer(s), "A");
});

// ------------------------------------------------------------- Cricket

test("cricket: closing + scoring turn, standard MPR dead-dart rule", () => {
  let s = createGame({ gameType: "cricket", players: ["A", "B"], config: { variant: "standard" } });
  // T20, T20, single bull → close 20 (3 marks) + 3 scoring hits (60 pts) + 1 bull mark
  s = play(s, [dart(20, 3), dart(20, 3), dart(25, 1), endTurn]);
  assert.equal(s.engine.A.markCount, 7);
  assert.equal(s.engine.A.points, 60);
  assert.deepEqual(s.engine.A.roundMarks, [7]);
  assert.equal(s.engine.A.rounds, 1);
  assert.equal(currentPlayer(s), "B");
});

test("cricket: dead darts count zero marks once everyone closed the number", () => {
  let s = createGame({ gameType: "cricket", players: ["A", "B"], config: { variant: "standard" } });
  s = play(s, [dart(20, 3), endTurn]); // A closes 20
  s = play(s, [dart(20, 3), endTurn]); // B closes 20
  s = play(s, [dart(20, 3), endTurn]); // A: 3 dead hits on 20
  assert.equal(s.engine.A.markCount, 3); // unchanged beyond the close
  assert.equal(s.engine.A.points, 0);
  assert.deepEqual(s.engine.A.roundMarks, [3, 0]);
});

test("cricket: standard win needs all closed and points lead", () => {
  let s = createGame({ gameType: "cricket", players: ["A", "B"], config: { variant: "standard" } });
  s = play(s, [dart(20, 3), dart(19, 3), dart(18, 3), endTurn]); // A closes 20/19/18
  s = play(s, [endTurn]); // B passes
  s = play(s, [dart(17, 3), dart(16, 3), dart(15, 3), endTurn]); // A closes the rest
  s = play(s, [endTurn]); // B passes
  assert.equal(s.status, "active"); // bull still open
  s = play(s, [dart(25, 2), dart(25, 1), endTurn]); // A closes bull; 0-0 points → leads
  assert.equal(s.status, "completed");
  assert.equal(s.winner, "A");
  assert.equal(s.engine.A.rounds, 3);
});

test("cricket cutthroat: surplus hits give points to open opponents; lowest wins", () => {
  let s = createGame({ gameType: "cricket", players: ["A", "B"], config: { variant: "cutthroat" } });
  s = play(s, [dart(20, 3), dart(20, 1), endTurn]); // A closes 20, then 1 scoring hit → B +20
  assert.equal(s.engine.B.points, 20);
  assert.equal(s.engine.A.points, 0);
  assert.equal(s.engine.A.markCount, 4); // 3 closing + 1 scoring (B still open)
});

test("cricket no-score: first to close everything wins; surplus marks are dead", () => {
  let s = createGame({ gameType: "cricket", players: ["A", "B"], config: { variant: "noscore" } });
  const seq = [];
  for (const n of [20, 19, 18, 17, 16, 15]) seq.push(dart(n, 3), dart(n, 1), endTurn, endTurn); // A closes + 1 dead, B passes
  seq.push(dart(25, 2), dart(25, 1), endTurn);
  s = play(s, seq);
  assert.equal(s.status, "completed");
  assert.equal(s.winner, "A");
  assert.equal(s.engine.A.markCount, 21); // 6×3 + bull 3; surplus singles were dead
});

test("cricket: empty manual end-turn counts a zero-mark round; empty removal does not", () => {
  let s = createGame({ gameType: "cricket", players: ["A", "B"], config: { variant: "standard" } });
  s = applyGameEvent(s, removeDarts); // unexpected reset: no-op
  assert.equal(s.engine.A.rounds, 0);
  s = applyGameEvent(s, endTurn);
  assert.equal(s.engine.A.rounds, 1);
  assert.deepEqual(s.engine.A.roundMarks, [0]);
});

// ------------------------------------------------------------ Baseball

test("baseball: target-only runs, auto-commit at 3 darts, off-target kept in log", () => {
  let s = createGame({ gameType: "baseball", players: ["A", "B"], config: {} });
  s = play(s, [dart(1, 3), dart(1, 1), dart(5, 3)]); // inning 1, target 1: 3+1 runs, 5 is off-target
  assert.equal(s.engine.A.total, 4);
  assert.deepEqual(s.engine.A.innings, [4]);
  assert.equal(s.engine.A.log.length, 3);
  assert.equal(currentPlayer(s), "B");
});

test("baseball: nine innings, unique leader wins; tie forces extras", () => {
  let s = createGame({ gameType: "baseball", players: ["A", "B"], config: {} });
  for (let inning = 1; inning <= 9; inning++) {
    s = play(s, [dart(inning, 1), endTurn]); // A scores 1
    const bDarts = inning === 9 ? [] : [dart(inning, 1)]; // B ties until the 9th
    s = play(s, [...bDarts, endTurn]);
  }
  assert.equal(s.status, "completed");
  assert.equal(s.winner, "A");
  assert.equal(s.engine.A.total, 9);
  assert.equal(s.engine.B.total, 8);

  let t = createGame({ gameType: "baseball", players: ["A", "B"], config: {} });
  for (let inning = 1; inning <= 9; inning++) {
    t = play(t, [dart(inning, 1), endTurn, dart(inning, 1), endTurn]);
  }
  assert.equal(t.status, "active"); // tied → extra innings
  t = play(t, [dart(10, 1), endTurn, endTurn]); // extra inning 10: A scores, B doesn't
  assert.equal(t.status, "completed");
  assert.equal(t.winner, "A");
});

// ----------------------------------------------------- General reducer

test("serialize/deserialize round-trips exactly", () => {
  let s = createGame({ gameType: "cricket", players: ["A", "B"], config: { variant: "standard" } });
  s = play(s, [dart(20, 3), dart(19, 1), endTurn, dart(19, 3), endTurn]);
  const restored = deserializeGame(serializeGame(s));
  assert.deepEqual(restored, s);
  // and play continues identically from the restored state
  const a = play(s, [dart(18, 3), endTurn]);
  const b = play(restored, [dart(18, 3), endTurn]);
  assert.deepEqual(a, b);
});

test("illegal darts and unknown events are ignored, never throw", () => {
  let s = createGame({ gameType: "x01", players: ["A"], config: { startScore: 501, doubleOut: false } });
  const before = serializeGame(s);
  s = applyGameEvent(s, dart(21, 1));
  s = applyGameEvent(s, dart(25, 3));
  s = applyGameEvent(s, dart(-1, 1));
  s = applyGameEvent(s, { type: "something.new" });
  assert.equal(serializeGame(s), before);
});

test("completed games ignore further darts; abandon stops play", () => {
  let s = createGame({ gameType: "x01", players: ["A"], config: { startScore: 20, doubleOut: false } });
  s = play(s, [dart(20, 1)]);
  assert.equal(s.status, "completed");
  const after = applyGameEvent(s, dart(20, 1));
  assert.deepEqual(after, s);

  let t = createGame({ gameType: "x01", players: ["A"], config: { startScore: 501, doubleOut: false } });
  t = applyGameEvent(t, { type: GameEvent.ABANDON });
  assert.equal(t.status, "abandoned");
  assert.equal(deriveCompletedResult(t, "x"), null);
});

test("scoring-core dartValue matches lib/darts.js", async () => {
  const { dartValue } = await import("../lib/darts.js");
  for (const d of [{ n: 0, mult: 0 }, { n: 25, mult: 2 }, { n: 25, mult: 1 }, { n: 20, mult: 3 }, { n: 7, mult: 2 }]) {
    assert.equal(coreDartValue(d), dartValue(d));
  }
});

// ---------------------------------------------------- review regressions

test("cricket: an all-off-target hardware visit still advances on removal", () => {
  let s = createGame({ gameType: "cricket", players: ["A", "B"], config: { variant: "standard" } });
  s = play(s, [dart(12, 1), dart(12, 3), dart(0, 0), removeDarts]);
  assert.equal(currentPlayer(s), "B"); // turn advanced despite zero marks
  assert.equal(s.engine.A.rounds, 1);
  assert.deepEqual(s.engine.A.roundMarks, [0]);
  assert.deepEqual(s.engine.A.log, [{ n: 12, mult: 1 }, { n: 12, mult: 3 }, { n: 0, mult: 0 }]);
});

test("abandoned games are terminal: undo cannot revert committed turns", () => {
  let s = createGame({ gameType: "x01", players: ["A"], config: { startScore: 501, doubleOut: false } });
  s = play(s, [dart(20, 3), dart(20, 3), dart(20, 3)]); // commit 180
  s = applyGameEvent(s, { type: GameEvent.ABANDON });
  const after = applyGameEvent(s, undo);
  assert.deepEqual(after, s); // no resurrection, no turn rollback
});

test("fromProdigyEvent: envelope supplies the hardware idempotency key", async () => {
  const { fromProdigyEvent } = await import("../packages/scoring-core/events.js");
  const parsed = { type: "dart.detected", raw: "Dart: 20,3", dart: { n: 20, mult: 3 } };
  const bare = fromProdigyEvent(parsed);
  assert.equal(bare.hardwareEventId, undefined);
  const wrapped = fromProdigyEvent(parsed, { boardId: "b1", bootId: "boot1", seq: 7 });
  assert.equal(wrapped.hardwareEventId, "b1:boot1:7");
  assert.deepEqual(wrapped.dart, { n: 20, mult: 3 });
});
