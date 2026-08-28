import { useState } from "react";
import { BackBar } from "./ui";
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

export default function Insights({ usernames, stats, elo, results, gameCount, back }) {
  const known = usernames.filter((u) => stats[u]);
  const [kind, setKind] = useState("league");
  const [a, setA] = useState(known[0] || "");
  const [b, setB] = useState(known[1] || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");

  const buildSummary = () => {
    if (kind === "player") {
      const ranked = [...known].sort((x, y) => (elo[y] || BASE_ELO) - (elo[x] || BASE_ELO));
      return {
        focusPlayer: playerRow(a, stats, elo),
        leagueRankOfFocus: ranked.indexOf(a) + 1,
        leagueSize: known.length,
        totalGames: gameCount,
      };
    }
    if (kind === "matchup") {
      const Ra = elo[a] || BASE_ELO;
      const Rb = elo[b] || BASE_ELO;
      const h2h = headToHead(results, a, b);
      return {
        playerA: playerRow(a, stats, elo),
        playerB: playerRow(b, stats, elo),
        eloWinProbabilityA: round(1 / (1 + Math.pow(10, (Rb - Ra) / 400)), 2),
        headToHead: { aWins: h2h.aw, bWins: h2h.bw, gamesPlayed: h2h.n },
      };
    }
    if (kind === "custom") {
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
    }
    return {
      totalGames: gameCount,
      players: known.map((u) => playerRow(u, stats, elo)),
    };
  };

  const buildBody = () => {
    const base = { kind, summary: buildSummary() };
    if (kind === "custom") base.question = question;
    return base;
  };

  const generate = async () => {
    setBusy(true);
    setError("");
    setResult("");
    setModel("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify(buildBody()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data.text);
      setModel(data.model || "");
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const canGenerate =
    known.length > 0 &&
    (kind === "league" ||
      (kind === "custom" && question.trim()) ||
      (kind === "player" && a) ||
      (kind === "matchup" && a && b && a !== b));

  return (
    <div className="fade">
      <BackBar back={back} title="AI Insights" />

      {known.length === 0 ? (
        <p className="subtle">Log a few games first — the AI needs data to analyse.</p>
      ) : (
        <>
          <div className="card mb-12">
            <div className="row mb-12">
              {[
                ["league", "League"],
                ["player", "Player"],
                ["matchup", "Matchup"],
                ["custom", "Ask"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={`btn ${kind === k ? "btn-primary" : ""}`}
                  style={{ flex: 1, padding: "10px 6px" }}
                  onClick={() => {
                    setKind(k);
                    setResult("");
                    setError("");
                  }}
                >
                  {l}
                </button>
              ))}
            </div>

            {kind === "player" && (
              <select className="select" value={a} onChange={(e) => setA(e.target.value)}>
                {known.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            )}

            {kind === "matchup" && (
              <div className="row">
                <select className="select" value={a} onChange={(e) => setA(e.target.value)}>
                  {known.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <select className="select" value={b} onChange={(e) => setB(e.target.value)}>
                  {known.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {kind === "custom" && (
              <div>
                <textarea
                  className="input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask anything about the league — e.g. 'Who has the best checkout under pressure?' or 'Who's improved most lately?'"
                  rows={3}
                  maxLength={600}
                  style={{ resize: "vertical", lineHeight: 1.5 }}
                />
                <p className="tag" style={{ textTransform: "none", letterSpacing: 0, marginTop: 8 }}>
                  The AI answers using your league&apos;s real stats only.
                </p>
              </div>
            )}

            <button
              className="btn btn-primary mt-12"
              style={{ width: "100%", padding: 14 }}
              onClick={generate}
              disabled={busy || !canGenerate}
            >
              {busy ? "Analysing…" : kind === "custom" ? "Ask" : "Generate Insight"}
            </button>
          </div>

          {error && (
            <div className="card mb-12" style={{ borderColor: "var(--red)" }}>
              <p className="subtle" style={{ margin: 0, color: "var(--red)" }}>
                {error}
              </p>
            </div>
          )}

          {result && (
            <div className="card fade">
              <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{result}</p>
              {model && (
                <div className="tag" style={{ marginTop: 12 }}>
                  generated by {model}
                </div>
              )}
            </div>
          )}

          {!result && !error && !busy && (
            <p className="tag" style={{ textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>
              Insights are written by your configured AI provider from the league&apos;s real
              stats. Pick a focus and generate.
            </p>
          )}
        </>
      )}
    </div>
  );
}
