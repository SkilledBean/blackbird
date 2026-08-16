import { test } from "node:test";
import assert from "node:assert/strict";
import { ProdigyParser, parseProdigyLine, READ_ONLY_COMMANDS } from "../lib/prodigy/parser.js";

test("dart: two-field form", () => {
  const e = parseProdigyLine("Dart: 20,3");
  assert.equal(e.type, "dart.detected");
  assert.deepEqual(e.dart, { n: 20, mult: 3 });
});

test("dart: five-field form keeps position data", () => {
  const e = parseProdigyLine("Dart: 20,3,72.4,184.5,false");
  assert.equal(e.type, "dart.detected");
  assert.equal(e.dart.n, 20);
  assert.equal(e.dart.mult, 3);
  assert.equal(e.dart.r, 72.4);
  assert.equal(e.dart.theta, 184.5);
  assert.equal(e.dart.scoreError, false);
});

test("dart: bull, permissive miss forms", () => {
  assert.equal(parseProdigyLine("Dart: 25,2").type, "dart.detected");
  assert.equal(parseProdigyLine("Dart: 0,0").type, "dart.detected");
  assert.equal(parseProdigyLine("Dart: 0,1").type, "dart.detected");
});

test("dart: wrong field count and illegal values are flagged, not thrown", () => {
  assert.equal(parseProdigyLine("Dart: 20").type, "protocol.unknown");
  assert.equal(parseProdigyLine("Dart: 20,3,1").type, "protocol.unknown");
  assert.equal(parseProdigyLine("Dart: 21,1").type, "protocol.invalid");
  assert.equal(parseProdigyLine("Dart: 25,3").type, "protocol.invalid");
  assert.equal(parseProdigyLine("Dart: x,y").type, "protocol.invalid");
});

test("reset, clarity, metadata, unknown", () => {
  assert.equal(parseProdigyLine("Reset: 0").type, "darts.removed");
  const c = parseProdigyLine("Clarity: 2,97");
  assert.deepEqual([c.type, c.dartsInView, c.clarity], ["board.clarity", 2, 97]);
  assert.equal(parseProdigyLine("Clarity: a,b").type, "protocol.invalid");
  const m = parseProdigyLine('Metadata: {"board_serial":"X1","rotation":3}');
  assert.equal(m.type, "board.metadata");
  assert.equal(m.metadata.board_serial, "X1");
  assert.equal(parseProdigyLine("Metadata: {broken").type, "protocol.invalid");
  assert.equal(parseProdigyLine("SomethingNew: 1,2").type, "protocol.unknown");
});

test("parser buffers arbitrary chunking across frames", () => {
  const events = [];
  const p = new ProdigyParser((e) => events.push(e));
  p.push("Dart: 2");
  p.push("0,3\r\nRes");
  assert.equal(events.length, 1); // partial second line held
  p.push("et: 0\r\nClarity: 0,99\r\nDart: 19,1\r\n");
  assert.deepEqual(
    events.map((e) => e.type),
    ["dart.detected", "darts.removed", "board.clarity", "dart.detected"]
  );
  assert.equal(events[3].dart.n, 19);
});

test("blank lines are skipped; read-only command list is stable", () => {
  const events = [];
  const p = new ProdigyParser((e) => events.push(e));
  p.push("\r\n\r\nDart: 5,1\r\n");
  assert.equal(events.length, 1);
  assert.ok(READ_ONLY_COMMANDS.every((c) => c.startsWith("Command: get_")));
});
