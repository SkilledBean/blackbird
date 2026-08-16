#!/usr/bin/env node
/**
 * Read-only Prodigy D9000W protocol logger (guide §30.1 — Phase 1).
 *
 * Run this on a laptop on the same network as the board (or later on the
 * board itself against 127.0.0.1). It:
 *   1. probes port 9001 over TLS and records the certificate subject,
 *      issuer, validity window, and SHA-256 fingerprint;
 *   2. opens the WebSocket, sends ONLY the read-only metadata commands,
 *      and never sends correction/reset/Wi-Fi/rotation/brightness/
 *      sensitivity commands;
 *   3. appends every raw line to a capture file with a timestamp and
 *      prints the normalized event stream live.
 *
 * The board uses a private/self-signed certificate, so for LAB CAPTURE
 * ONLY run with relaxed verification (the vendor client does the same):
 *
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 node tools/prodigy-logger.mjs \
 *     wss://192.168.1.50:9001 captures/board-a-$(date +%Y%m%d).log
 *
 * Requires Node 21+ (built-in WebSocket client). Throw the §30.2 test
 * matrix while it runs; send the capture file back for fixture pinning.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { ProdigyParser, READ_ONLY_COMMANDS } from "../lib/prodigy/parser.js";

const [, , url, outFile] = process.argv;
if (!url || !outFile) {
  console.error("usage: node tools/prodigy-logger.mjs wss://<board-ip>:9001 <capture-file>");
  process.exit(1);
}
if (typeof WebSocket === "undefined") {
  console.error("Node 21+ required (built-in WebSocket client).");
  process.exit(1);
}

mkdirSync(dirname(outFile), { recursive: true });
const log = (kind, text) => {
  const line = `${new Date().toISOString()}\t${kind}\t${text}\n`;
  appendFileSync(outFile, line);
  process.stdout.write(line);
};

const { hostname, port } = new URL(url);

// 1. certificate probe (guide §8.6)
await new Promise((resolve) => {
  const sock = tlsConnect(
    { host: hostname, port: Number(port || 9001), rejectUnauthorized: false, timeout: 8000 },
    () => {
      const cert = sock.getPeerCertificate();
      log("cert", `subject=${JSON.stringify(cert.subject)}`);
      log("cert", `issuer=${JSON.stringify(cert.issuer)}`);
      log("cert", `valid=${cert.valid_from} .. ${cert.valid_to}`);
      log("cert", `sha256-fingerprint=${cert.fingerprint256}`);
      sock.end();
      resolve();
    }
  );
  sock.on("error", (e) => {
    log("cert-error", String(e.message || e));
    resolve();
  });
  sock.on("timeout", () => {
    log("cert-error", "tls probe timeout");
    sock.destroy();
    resolve();
  });
});

// 2. websocket capture
const parser = new ProdigyParser((event) => log("event", JSON.stringify(event)));
const ws = new WebSocket(url);

ws.addEventListener("open", () => {
  log("open", url);
  for (const cmd of READ_ONLY_COMMANDS) {
    ws.send(`${cmd}\r\n`);
    log("sent", cmd);
  }
});
ws.addEventListener("message", async (m) => {
  const text = typeof m.data === "string" ? m.data : Buffer.from(await m.data.arrayBuffer?.() ?? m.data).toString();
  log("raw", JSON.stringify(text));
  parser.push(text);
});
ws.addEventListener("close", (e) => {
  log("close", `code=${e.code} reason=${e.reason || ""}`);
  process.exit(0);
});
ws.addEventListener("error", () => log("ws-error", "socket error (is NODE_TLS_REJECT_UNAUTHORIZED=0 set for the lab capture?)"));

process.on("SIGINT", () => {
  log("stop", "interrupted by user");
  try {
    ws.close();
  } catch {}
  process.exit(0);
});
