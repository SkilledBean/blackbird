/**
 * Game events consumed by the scoring reducer. Every input surface —
 * manual UI buttons, the Prodigy hardware bridge, replay/recovery —
 * produces these; the reducer is the only place rules live.
 * (docs/prodigy-development-guide.md §25)
 */
export const GameEvent = {
  DART: "game.dart",
  REMOVE_DARTS: "game.remove-darts",
  CORRECT_DART: "game.correct-dart",
  VOID_DART: "game.void-dart",
  END_TURN: "game.end-turn",
  UNDO: "game.undo",
  ABANDON: "game.abandon",
};

/** A dart is { n, mult }: n 1–20, 25 = bull (mult 1|2), n 0/mult 0 = miss. */
export function fromManualDart(dart) {
  return { type: GameEvent.DART, source: "manual", dart };
}

export function fromManualEndTurn() {
  return { type: GameEvent.END_TURN, source: "manual" };
}

export function fromManualUndo() {
  return { type: GameEvent.UNDO, source: "manual" };
}

/**
 * Adapt a normalized Prodigy event. Parser-level events (lib/prodigy/
 * parser.js) carry no identity; the board daemon wraps them in the §9.3
 * envelope, whose (boardId, bootId, seq) triple becomes the idempotency
 * key. Pass that envelope here — without it there is no hardwareEventId
 * and duplicate deliveries cannot be deduplicated.
 */
export function fromProdigyEvent(event, envelope) {
  const src = envelope ?? event;
  const hardwareEventId =
    src.boardId != null && src.bootId != null && src.seq != null
      ? `${src.boardId}:${src.bootId}:${src.seq}`
      : undefined;
  if (event.type === "dart.detected") {
    return { type: GameEvent.DART, source: "prodigy", hardwareEventId, dart: { n: event.dart.n, mult: event.dart.mult } };
  }
  if (event.type === "darts.removed") {
    return { type: GameEvent.REMOVE_DARTS, source: "prodigy", hardwareEventId };
  }
  return null;
}
