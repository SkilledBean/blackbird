/** Shared dart formatting used by the play screens and the TV scoreboard. */

export const dartValue = (d) => (d.n === 0 ? 0 : d.n === 25 ? 25 * d.mult : d.n * d.mult);

export const dartLabel = (d) =>
  d.n === 0 ? "Miss" : d.n === 25 ? (d.mult === 2 ? "Bull" : "25") : `${d.mult === 1 ? "S" : d.mult === 2 ? "D" : "T"}${d.n}`;

/** Cricket mark cell: 1 hit "/", 2 hits "✕", closed "⊗". */
export const markSymbol = (n) => (n <= 0 ? "" : n === 1 ? "/" : n === 2 ? "✕" : "⊗");
