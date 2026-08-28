import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { headToHead } from "@/lib/stats";
import { BASE_ELO } from "@/lib/constants";

function round(n, d = 0) {
  const f = Math.pow(10, d);
  return Math.round((n || 0) * f) / f;
}

function playerRow(u, stats, elo) {
  const s = stats[u];
  return {
    name: u,
    elo: Math.round(elo[u] || BASE_ELO),
    games: s.games,
    wins: s.wins,
    winPct: round(s.winPct),
    x01ThreeDartAvg: round(s.x01.threeDartAvg, 1),
    x01Record: `${s.x01.wins}-${s.x01.games - s.x01.wins}`,
    bestLeg: s.x01.bestLeg,
    highestCheckout: s.x01.highestCheckout,
    highestTurn: s.x01.highestTurn,
    cricketMPR: round(s.cricket.mpr, 2),
    cricketBestMPR: round(s.cricket.bestMpr, 2),
    cricketRecord: `${s.cricket.wins}-${s.cricket.games - s.cricket.wins}`,
  };
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5.5" y="1.5" width="9" height="11" rx="2" />
      <path d="M3.5 5v7.5a2 2 0 002 2H12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3.5 3.5 6.5-7" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 12V4" />
      <path d="M4 7l4-4 4 4" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3H3a1 1 0 00-1 1v8a1 1 0 001 1h2v3l4-3h6a1 1 0 001-1V4a1 1 0 00-1-1z" />
      <path d="M9 6v4M7 8h4" />
    </svg>
  );
}

export default function Insights({ usernames, stats, elo, results, gameCount, back }) {
  const known = usernames.filter((u) => stats[u]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [selA, setSelA] = useState(known[0] || "");
  const [selB, setSelB] = useState(known[1] || known[0] || "");
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const leagueSummary = () => ({
    totalGames: gameCount,
    players: known.map((u) => playerRow(u, stats, elo)),
  });

  const playerSummary = (player) => {
    const ranked = [...known].sort((x, y) => (elo[y] || BASE_ELO) - (elo[x] || BASE_ELO));
    return {
      focusPlayer: playerRow(player, stats, elo),
      leagueRankOfFocus: ranked.indexOf(player) + 1,
      leagueSize: known.length,
      totalGames: gameCount,
    };
  };

  const matchupSummary = (pa, pb) => {
    const Ra = elo[pa] || BASE_ELO;
    const Rb = elo[pb] || BASE_ELO;
    const h2h = headToHead(results, pa, pb);
    return {
      playerA: playerRow(pa, stats, elo),
      playerB: playerRow(pb, stats, elo),
      eloWinProbabilityA: round(1 / (1 + Math.pow(10, (Rb - Ra) / 400)), 2),
      headToHead: { aWins: h2h.aw, bWins: h2h.bw, gamesPlayed: h2h.n },
    };
  };

  const customSummary = () => {
    const recentGames = (results || []).slice(-200).map((r) => ({
      gameType: r.gameType,
      username: r.username,
      result: r.result,
      opponents: r.opponents,
      completedAt: r.completedAt,
      config: r.config,
      stats: r.stats,
    }));
    return {
      totalGames: gameCount,
      players: known.map((u) => playerRow(u, stats, elo)),
      recentGameResults: recentGames,
    };
  };

  const send = async (displayText, kind, summary, question) => {
    const id = Date.now();
    setMessages((prev) => [...prev, { id, role: "user", content: displayText }]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setBusy(true);
    setPendingAction(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const body = { kind, summary };
      if (kind === "custom") body.question = question || displayText;
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages((prev) => [...prev, { id: id + 1, role: "assistant", content: data.text }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: id + 1, role: "assistant", content: e.message || "Something went wrong.", error: true },
      ]);
    }
    setBusy(false);
  };

  const sendCustom = () => {
    const text = input.trim();
    if (!text || busy) return;
    send(text, "custom", customSummary(), text);
  };

  const copyMsg = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCustom();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  if (known.length === 0) {
    return (
      <div className="fade">
        <div className="between mb-12">
          <div className="display" style={{ fontSize: "calc(17px * var(--fs))" }}>AI Chat</div>
        </div>
        <p className="subtle">Log a few games first — the AI needs data to analyse.</p>
      </div>
    );
  }

  const empty = messages.length === 0 && !busy;

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", minHeight: "calc(100dvh - 120px)" }}>
      <div className="between mb-12">
        <div className="display" style={{ fontSize: "calc(17px * var(--fs))" }}>AI Chat</div>
        {messages.length > 0 && (
          <button
            className="btn"
            style={{ padding: "7px 10px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => {
              setMessages([]);
              setPendingAction(null);
            }}
            title="New Chat"
            aria-label="New Chat"
          >
            <NewChatIcon />
          </button>
        )}
      </div>

      <div style={{ flex: 1 }}>
        {empty && (
          <div style={{ textAlign: "center", padding: "24px 16px 32px" }}>
            <div style={{ fontWeight: 700, fontSize: "calc(20px * var(--fs))", marginBottom: 6 }}>
              Darts Analyst
            </div>
            <p className="subtle" style={{ margin: "0 0 24px", lineHeight: 1.5 }}>
              Ask anything about your league. Powered by real stats and game history.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "0 auto" }}>
              <button
                className="btn"
                style={{ width: "100%", padding: "12px 16px" }}
                onClick={() => send("Give me a league overview", "league", leagueSummary())}
              >
                League Overview
              </button>

              <button
                className="btn"
                style={{ width: "100%", padding: "12px 16px" }}
                onClick={() => setPendingAction(pendingAction === "player" ? null : "player")}
              >
                Player Profile
              </button>
              {pendingAction === "player" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <select className="select" style={{ flex: 1 }} value={selA} onChange={(e) => setSelA(e.target.value)}>
                    {known.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "8px 16px" }}
                    onClick={() => send(`Tell me about ${selA}`, "player", playerSummary(selA))}
                  >
                    Go
                  </button>
                </div>
              )}

              <button
                className="btn"
                style={{ width: "100%", padding: "12px 16px" }}
                onClick={() => setPendingAction(pendingAction === "matchup" ? null : "matchup")}
              >
                Head-to-Head
              </button>
              {pendingAction === "matchup" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <select className="select" style={{ flex: 1 }} value={selA} onChange={(e) => setSelA(e.target.value)}>
                    {known.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <select className="select" style={{ flex: 1 }} value={selB} onChange={(e) => setSelB(e.target.value)}>
                    {known.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "8px 16px" }}
                    onClick={() => send(`${selA} vs ${selB}`, "matchup", matchupSummary(selA, selB))}
                    disabled={selA === selB}
                  >
                    Go
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius:
                  msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background:
                  msg.role === "user"
                    ? "var(--accent)"
                    : msg.error
                      ? "var(--red-soft)"
                      : "var(--surface)",
                color: msg.role === "user" ? "#fff" : msg.error ? "var(--red)" : "var(--ink)",
                border: msg.role === "user" ? "none" : "1px solid var(--line)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: "calc(15px * var(--fs))",
              }}
            >
              {msg.content}
            </div>
            {msg.role === "assistant" && !msg.error && (
              <button
                onClick={() => copyMsg(msg.content, msg.id)}
                style={{
                  marginTop: 4,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: copied === msg.id ? "var(--accent)" : "var(--muted)",
                  padding: "3px 8px",
                  borderRadius: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "calc(12px * var(--fs))",
                  fontFamily: "inherit",
                  transition: "color 0.15s",
                }}
              >
                {copied === msg.id ? (
                  <>
                    <CheckIcon /> Copied
                  </>
                ) : (
                  <>
                    <CopyIcon /> Copy
                  </>
                )}
              </button>
            )}
          </div>
        ))}

        {busy && (
          <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 16 }}>
            <div
              style={{
                padding: "14px 20px",
                borderRadius: "18px 18px 18px 4px",
                background: "var(--surface)",
                border: "1px solid var(--line)",
              }}
            >
              <div className="typing-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--bg)",
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the league..."
            rows={1}
            disabled={busy}
            style={{
              flex: 1,
              resize: "none",
              overflow: "hidden",
              border: "1px solid var(--line)",
              borderRadius: 22,
              padding: "10px 16px",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: "calc(15px * var(--fs))",
              fontFamily: "inherit",
              outline: "none",
              lineHeight: 1.4,
              minHeight: 44,
              maxHeight: 120,
            }}
          />
          <button
            onClick={sendCustom}
            disabled={!input.trim() || busy}
            aria-label="Send"
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "none",
              background: input.trim() && !busy ? "var(--accent)" : "var(--line)",
              color: input.trim() && !busy ? "#fff" : "var(--muted)",
              cursor: input.trim() && !busy ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
