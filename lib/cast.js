import { supabase } from "./supabase";

/**
 * TV-cast transport. The phone (publisher) and any number of TVs
 * (subscribers) join a channel named by a short room code and exchange
 * JSON events:
 *   "state"    { game, snapshot }   phone → TVs, on every scoring change
 *   "finished" { game, winner }     phone → TVs
 *   "ended"    {}                   phone → TVs, on quit
 *   "hello"    {}                   TV → phone, on join (phone answers
 *                                   with the current state so late
 *                                   joiners sync immediately)
 *
 * Two transports behind one interface:
 *  - Supabase Realtime broadcast (production; no tables, no writes)
 *  - window.BroadcastChannel (same-browser, for tests/dev — enabled by
 *    a ?localcast=1 query param or NEXT_PUBLIC_CAST_TRANSPORT=local)
 */

// no ambiguous glyphs (0/O, 1/I/L, ...) — easy to read across a room
const CODE_ALPHABET = "ACDEFHJKMNPRTWXY34679";

export function makeCastCode() {
  let c = "";
  for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

export function normalizeCastCode(raw) {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

const CAST_EVENTS = ["state", "finished", "ended", "hello"];

function useLocalTransport() {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_CAST_TRANSPORT === "local") return true;
  return new URLSearchParams(window.location.search).has("localcast");
}

export function castAvailable() {
  return useLocalTransport() || !!supabase;
}

/**
 * Open the cast channel for a room code. `onEvent(event, payload)` fires
 * for every event sent by the other side; `onReady()` fires once the
 * channel is actually joined and messages can be received (important for
 * a TV that wants to send "hello" and hear the reply). Returns
 * { send, close } or null when no transport is available.
 */
export function openCastChannel(code, onEvent, onReady) {
  if (useLocalTransport()) {
    const bc = new BroadcastChannel(`blackbird-cast:${code}`);
    bc.onmessage = (e) => {
      const { event, payload } = e.data || {};
      if (CAST_EVENTS.includes(event)) onEvent(event, payload);
    };
    if (onReady) setTimeout(onReady, 0);
    return {
      send: (event, payload) => bc.postMessage({ event, payload }),
      close: () => bc.close(),
    };
  }

  if (!supabase) return null;
  const ch = supabase.channel(`cast:${code}`, { config: { broadcast: { self: false } } });
  for (const event of CAST_EVENTS) {
    ch.on("broadcast", { event }, ({ payload }) => onEvent(event, payload));
  }
  let ready = false;
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED" && !ready) {
      ready = true;
      if (onReady) onReady();
    }
  });
  return {
    send: (event, payload) => ch.send({ type: "broadcast", event, payload }),
    close: () => supabase.removeChannel(ch),
  };
}

/** Live-progress snapshots carry an unbounded undo history — never broadcast it. */
export function stripHistory(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const { history, ...rest } = snapshot;
  return rest;
}
