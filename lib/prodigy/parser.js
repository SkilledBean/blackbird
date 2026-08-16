/**
 * Prodigy D9000W protocol parser (docs/prodigy-development-guide.md §9).
 *
 * The board's location engine speaks CRLF-terminated text lines over a
 * secure WebSocket on port 9001. This parser buffers arbitrary chunking
 * (partial lines, several lines per frame, lines split across frames),
 * normalizes known records, and NEVER throws on unknown or malformed
 * input — unknown prefixes become "protocol.unknown", bad numbers become
 * "protocol.invalid".
 *
 * This is the reference implementation and executable documentation for
 * the on-board bridge; the desktop logger (tools/prodigy-logger.mjs)
 * uses it directly. Version-pin captures per firmware: this interface is
 * observed, not vendor-documented.
 */
import { isLegalDart } from "../../packages/scoring-core/validation.js";

export class ProdigyParser {
  constructor(onEvent) {
    this.buffer = "";
    this.onEvent = onEvent;
  }

  /** Feed a raw chunk (string or Buffer-like); emits one event per complete line. */
  push(chunk) {
    this.buffer += String(chunk);
    for (;;) {
      const end = this.buffer.indexOf("\r\n");
      if (end < 0) return;
      const line = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + 2);
      if (line) this.onEvent(parseProdigyLine(line));
    }
  }
}

export function parseProdigyLine(line) {
  if (line.startsWith("Dart:")) {
    const rawFields = line.slice(5).trim().split(",");

    if (rawFields.length !== 2 && rawFields.length !== 5) {
      return { type: "protocol.unknown", raw: line, reason: "dart-field-count" };
    }

    const n = Number.parseInt(rawFields[0], 10);
    const mult = Number.parseInt(rawFields[1], 10);
    const event = { type: "dart.detected", raw: line, dart: { n, mult } };

    if (rawFields.length === 5) {
      event.dart.r = Number.parseFloat(rawFields[2]);
      event.dart.theta = Number.parseFloat(rawFields[3]);
      event.dart.scoreError = rawFields[4].trim() === "true";
    }

    if (!isLegalDart(event.dart)) {
      return { type: "protocol.invalid", raw: line, parsed: event };
    }
    return event;
  }

  if (line.startsWith("Reset:")) {
    return { type: "darts.removed", raw: line };
  }

  if (line.startsWith("Clarity:")) {
    const [dartsInView, clarity] = line.slice(8).trim().split(",").map(Number);
    if (!Number.isFinite(dartsInView) || !Number.isFinite(clarity)) {
      return { type: "protocol.invalid", raw: line, reason: "clarity-fields" };
    }
    return { type: "board.clarity", raw: line, dartsInView, clarity };
  }

  if (line.startsWith("Metadata:")) {
    try {
      return { type: "board.metadata", raw: line, metadata: JSON.parse(line.slice(9).trim()) };
    } catch {
      return { type: "protocol.invalid", raw: line, reason: "metadata-json" };
    }
  }

  return { type: "protocol.unknown", raw: line };
}

/** Read-only commands the first bridge build is allowed to send (§8.4). */
export const READ_ONLY_COMMANDS = [
  "Command: get_le_version",
  "Command: get_board_info",
  "Command: get_disk_space",
  "Command: get_clarity",
  "Command: get_visible_brightness",
  "Command: get_trigger_thold",
];
