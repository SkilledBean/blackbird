"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { openCastChannel, normalizeCastCode, castAvailable } from "@/lib/cast";
import TVScoreboard from "@/components/tv/TVScoreboard";

/**
 * TV scoreboard screen. Open this page on anything that can show a
 * browser on the TV (smart TV browser, a tab-cast from a laptop, an
 * AirPlayed Safari window), enter the 4-character code shown on the
 * phone, and the live game renders big. No sign-in required — the page
 * only listens to broadcast state.
 */
export default function TVPage() {
  return (
    <Suspense fallback={null}>
      <TV />
    </Suspense>
  );
}

function TV() {
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  // idle → waiting → live → finished → (waiting | live)
  const [status, setStatus] = useState("idle");
  const [game, setGame] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [winner, setWinner] = useState(null);
  // false until anything arrives from the phone — used to tell a wrong
  // code apart from "right code, game not started yet"
  const [linked, setLinked] = useState(false);
  const [helloTimedOut, setHelloTimedOut] = useState(false);
  const channel = useRef(null);
  const helloTimer = useRef(null);

  // display style: "board" (scoreboard + dartboard) or "score" (score
  // only, extra large). Remembered per TV.
  const [displayMode, setDisplayMode] = useState("board");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("bb-tv-display");
      if (v === "score" || v === "board") setDisplayMode(v);
    } catch {}
  }, []);
  const toggleDisplay = () =>
    setDisplayMode((m) => {
      const next = m === "board" ? "score" : "board";
      try {
        window.localStorage.setItem("bb-tv-display", next);
      } catch {}
      return next;
    });

  // TVs always render the dark theme
  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
  }, []);

  const join = useCallback((raw) => {
    const c = normalizeCastCode(raw);
    if (c.length !== 4) return;
    if (channel.current) channel.current.close();
    if (helloTimer.current) clearTimeout(helloTimer.current);
    setLinked(false);
    setHelloTimedOut(false);
    const markLinked = () => {
      setLinked(true);
      setHelloTimedOut(false);
      if (helloTimer.current) clearTimeout(helloTimer.current);
    };
    const ch = openCastChannel(
      c,
      (event, payload) => {
        markLinked();
        if (event === "state") {
          setGame(payload.game);
          setSnapshot(payload.snapshot);
          setWinner(null);
          setStatus("live");
        } else if (event === "finished") {
          setWinner(payload.winner);
          if (payload.game) setGame(payload.game);
          setStatus("finished");
        } else if (event === "ended") {
          setStatus("waiting");
          setSnapshot(null);
        } else if (event === "stopped") {
          // the phone stopped casting — back to the code-entry screen
          if (channel.current) channel.current.close();
          channel.current = null;
          setGame(null);
          setSnapshot(null);
          setStatus("idle");
        }
      },
      () => {
        // channel joined — now the phone's reply can actually reach us
        ch.send("hello", {});
        helloTimer.current = setTimeout(() => setHelloTimedOut(true), 8000);
      }
    );
    if (!ch) return;
    channel.current = ch;
    setCode(c);
    setStatus("waiting");
  }, []);

  // auto-join from ?code=ABCD (handy when tab-casting from a laptop)
  useEffect(() => {
    const c = params.get("code");
    if (c) {
      setInput(normalizeCastCode(c));
      join(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (helloTimer.current) clearTimeout(helloTimer.current);
      if (channel.current) channel.current.close();
    };
  }, []);

  if (status === "live" && game && snapshot) {
    return (
      <main className={`tv ${displayMode === "score" ? "tv-scoreonly" : ""}`}>
        <TVScoreboard game={game} snapshot={snapshot} />
        <div className="tv-footer">
          <span>Blackbird · code {code}</span>
          <button className="tv-style-btn" onClick={toggleDisplay}>
            {displayMode === "board" ? "hide board" : "show board"}
          </button>
        </div>
      </main>
    );
  }

  if (status === "finished") {
    return (
      <main className="tv">
        <div className="tv-center">
          <div className="tv-winner-label">winner</div>
          <div className="tv-winner-name">{winner}</div>
          <div className="tv-idle-sub">next game will appear automatically</div>
        </div>
        <div className="tv-footer">Blackbird · code {code}</div>
      </main>
    );
  }

  if (status === "waiting") {
    return (
      <main className="tv">
        <div className="tv-center">
          <div className="tv-title">Blackbird</div>
          <div className="tv-idle-sub">
            {linked || !helloTimedOut ? (
              <>
                code <span className="tv-code">{code}</span> — waiting for a game to start…
              </>
            ) : (
              <>
                no phone answered on code <span className="tv-code">{code}</span> — check the code
                shown on the phone
              </>
            )}
          </div>
          {!linked && helloTimedOut && (
            <button
              className="tv-btn"
              style={{ marginTop: "1.5vw" }}
              onClick={() => {
                if (channel.current) channel.current.close();
                channel.current = null;
                setStatus("idle");
              }}
            >
              Change code
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="tv">
      <div className="tv-center">
        <div className="tv-title">Blackbird</div>
        <div className="tv-sub">tv scoreboard</div>
        {castAvailable() ? (
          <form
            className="tv-join"
            onSubmit={(e) => {
              e.preventDefault();
              join(input);
            }}
          >
            <input
              className="tv-input"
              value={input}
              onChange={(e) => setInput(normalizeCastCode(e.target.value))}
              placeholder="CODE"
              maxLength={4}
              autoFocus
              aria-label="TV code from the phone"
            />
            <button className="tv-btn" type="submit" disabled={input.length !== 4}>
              Join
            </button>
          </form>
        ) : (
          <div className="tv-idle-sub">app is not configured</div>
        )}
        <div className="tv-help">
          <p>On the phone: start a game, tap Cast to TV, and enter the code here.</p>
          <p>Apple TV — AirPlay a Safari window showing this page.</p>
          <p>Smart TV — open this address in the TV browser.</p>
          <p>Chromecast — cast a browser tab showing this page.</p>
          <p>No TV browser? AirPlay-mirror an iPad or iPhone showing this page.</p>
        </div>
      </div>
    </main>
  );
}
