"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import { getPlayers, addPlayer as dbAddPlayer, setPlayerHidden as dbSetPlayerHidden, getGameResults, recordGame } from "@/lib/db";
import { computeStats, eloMapFromPlayers, applyEloUpdate } from "@/lib/stats";
import { ACCENTS, ADMIN_EMAIL } from "@/lib/constants";
import { applyFontScale } from "@/lib/prefs";
import { applySkin } from "@/lib/skins";
import { makeCastCode, openCastChannel, castAvailable, stripHistory } from "@/lib/cast";
import { Logo, GearIcon, CastIcon } from "@/components/ui";
import Auth from "@/components/Auth";
import Home from "@/components/Home";
import Setup from "@/components/Setup";
import PlayX01 from "@/components/PlayX01";
import PlayCricket from "@/components/PlayCricket";
import PlayBaseball from "@/components/PlayBaseball";
import Leaderboard from "@/components/Leaderboard";
import Profile from "@/components/Profile";
import Matchup from "@/components/Matchup";
import Insights from "@/components/Insights";
import Account from "@/components/Account";
import Admin from "@/components/Admin";
import LoadingScreen from "@/components/LoadingScreen";

export default function Page() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);

  // Branded splash: hold the loading screen 1–3 s on every open so the app
  // always launches with a moment of perceived loading.
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1000 + Math.random() * 2000);
    return () => clearTimeout(t);
  }, []);

  const [dataReady, setDataReady] = useState(false);
  const [players, setPlayers] = useState([]);
  const [results, setResults] = useState([]);
  const [loadError, setLoadError] = useState("");

  const [view, setView] = useState("home");
  const [live, setLive] = useState(null);
  const liveProgress = useRef(null);

  // ---- TV casting: broadcast live game state to /tv screens ----
  const [castCode, setCastCode] = useState(null);
  const castChannel = useRef(null);
  const liveGameRef = useRef(null);
  const castTimer = useRef(null);
  const lastCastAt = useRef(0);

  const sendCastState = useCallback(() => {
    if (!castChannel.current || !liveGameRef.current || !liveProgress.current) return;
    castChannel.current.send("state", {
      game: liveGameRef.current,
      snapshot: stripHistory(liveProgress.current),
    });
  }, []);

  const saveProgress = useCallback((p) => {
    liveProgress.current = p;
    if (!castChannel.current) return;
    const wait = Math.max(0, 200 - (Date.now() - lastCastAt.current));
    if (castTimer.current) clearTimeout(castTimer.current);
    castTimer.current = setTimeout(() => {
      lastCastAt.current = Date.now();
      sendCastState();
    }, wait);
  }, [sendCastState]);

  const toggleCast = useCallback(() => {
    if (castChannel.current) {
      // "stopped" (not "ended") sends TVs back to their code-entry screen
      castChannel.current.send("stopped", {});
      castChannel.current.close();
      castChannel.current = null;
      setCastCode(null);
      return;
    }
    const code = makeCastCode();
    const ch = openCastChannel(code, (event) => {
      // a late-joining TV asks for state; answer with the live snapshot,
      // or an explicit "ended" so it knows the code is right but nothing
      // is being played yet
      if (event === "hello") {
        if (liveGameRef.current && liveProgress.current) sendCastState();
        else castChannel.current && castChannel.current.send("ended", {});
      }
    });
    if (!ch) return;
    castChannel.current = ch;
    setCastCode(code);
  }, [sendCastState]);

  useEffect(() => {
    liveGameRef.current = live;
  }, [live]);

  useEffect(() => {
    return () => {
      if (castTimer.current) clearTimeout(castTimer.current);
      if (castChannel.current) castChannel.current.close();
    };
  }, []);
  const [profileUser, setProfileUser] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isConfigured) {
      setAuthReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // apply theme + accent color from the user's saved preferences
  useEffect(() => {
    if (typeof document === "undefined") return;
    const meta = (session && session.user && session.user.user_metadata) || {};
    document.documentElement.dataset.theme = ["dark", "glass"].includes(meta.theme) ? meta.theme : "light";
    const a = meta.accent;
    const accent = a ? (a.charAt(0) === "#" ? a : ACCENTS[a] || ACCENTS.green) : ACCENTS.green;
    // an active skin owns the whole palette — don't pin the accent inline
    // over it (inline style would beat the skin's CSS token)
    if (meta.skin && meta.skin !== "default") {
      document.documentElement.style.removeProperty("--accent");
    } else {
      document.documentElement.style.setProperty("--accent", accent);
    }
    applyFontScale(meta.fontScale);
    applySkin(meta.skin);
  }, [session]);

  const refresh = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([getPlayers(), getGameResults()]);
      setPlayers(p);
      setResults(r);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message || "Failed to load data.");
    } finally {
      setDataReady(true);
    }
  }, []);

  useEffect(() => {
    if (session) {
      setDataReady(false);
      refresh();
    }
  }, [session, refresh]);

  useEffect(() => {
    if (!session) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [session, refresh]);

  // ensure the signed-in user (by display name) is in the shared player list,
  // so everyone shows up in each other's "add player" dropdown
  useEffect(() => {
    if (!session || !dataReady) return;
    const meName = (session.user?.user_metadata?.display_name || "").trim();
    if (!meName) return;
    if (players.some((p) => p.username.toLowerCase() === meName.toLowerCase())) return;
    (async () => {
      await dbAddPlayer(meName);
      await refresh();
    })();
  }, [session, dataReady, players, refresh]);

  const usernames = useMemo(() => players.map((p) => p.username), [players]);
  // players who appear in standings (guests + self-hidden are excluded)
  const visibleUsernames = useMemo(
    () => players.filter((p) => !p.hidden).map((p) => p.username),
    [players]
  );
  const stats = useMemo(() => computeStats(results), [results]);
  const elo = useMemo(() => eloMapFromPlayers(players), [players]);
  const gameCount = useMemo(() => new Set(results.map((r) => r.gameId)).size, [results]);

  const isAdmin = useMemo(
    () => (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    [session]
  );

  const addPlayer = useCallback(async (name, hidden = false) => {
    const u = name.trim();
    if (!u) return false;
    if (players.some((p) => p.username.toLowerCase() === u.toLowerCase())) return false;
    const ok = await dbAddPlayer(u, hidden);
    if (ok) await refresh();
    return ok;
  }, [players, refresh]);

  const setPlayerHidden = useCallback(async (username, hidden) => {
    await dbSetPlayerHidden(username, hidden);
    await refresh();
  }, [refresh]);

  const finishMatch = useCallback(async (match) => {
    // stop any queued state broadcast so it can't land after "finished"
    // and flip the TV back to a stale live board
    if (castTimer.current) clearTimeout(castTimer.current);
    liveProgress.current = null;
    if (castChannel.current) {
      castChannel.current.send("finished", { game: liveGameRef.current, winner: match.winner });
    }
    if (match.players.length >= 2) {
      const winner = match.winner;
      const nextElo = applyEloUpdate(elo, match.players, winner);
      const gameId =
        (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await recordGame({
        gameId,
        gameType: match.gameType,
        config: match.config,
        players: match.players,
        winner,
        perPlayer: match.perPlayer,
        eloAfter: nextElo,
        completedAt: match.completedAt,
      });
      await refresh();
      setLive(null);
      liveProgress.current = null;
      setNotice("");
      setView("leaderboard");
    } else {
      // solo practice — not saved
      setLive(null);
      liveProgress.current = null;
      setNotice("Practice game finished — not saved to stats.");
      setView("home");
    }
  }, [refresh, elo]);

  const openProfile = (u) => {
    setProfileUser(u);
    setView("profile");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setView("home");
  };

  const quit = () => {
    if (castTimer.current) clearTimeout(castTimer.current);
    liveProgress.current = null;
    if (castChannel.current) castChannel.current.send("ended", {});
    setLive(null);
    setView("home");
  };

  const playViewFor = (gt) =>
    gt === "x01" ? "playX01" : gt === "cricket" ? "playCricket" : "playBaseball";
  const goPlay = () => setView(live ? playViewFor(live.gameType) : "setup");

  if (!isConfigured) {
    return (
      <main className="app">
        <div className="container" style={{ maxWidth: 460, paddingTop: 80 }}>
          <div className="card">
            <h2 className="section-title">Setup needed</h2>
            <p className="subtle">
              Supabase isn&apos;t configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your environment, then rebuild.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!authReady || !splashDone) return <LoadingScreen text="starting up…" />;
  if (!session) return <Auth />;
  if (!dataReady) return <LoadingScreen text="loading…" />;

  return (
    <main className="app shell">
      <div className="scroll">
        <div className="container">
        <header className="header">
          <Logo size={36} />
          <div style={{ flex: 1 }}>
            <div className="brand-title">Blackbird</div>
            <div className="tag" style={{ marginTop: 2 }}>
              dart scoring system
            </div>
          </div>
          <button className="btn" style={{ padding: "8px 11px" }} onClick={refresh} title="Refresh">
            ↻
          </button>
          <button
            className="btn"
            style={{ padding: "8px 11px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => setView("account")}
            title="Settings"
            aria-label="Settings"
          >
            <GearIcon />
          </button>
          <button
            className="btn"
            style={{ padding: "8px 11px", maxWidth: "calc(120px * var(--fs))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            onClick={() => {
              const me = session.user?.user_metadata?.display_name;
              if (me) openProfile(me);
              else setView("account");
            }}
            title="Your stats & card"
          >
            {session.user?.user_metadata?.display_name || "Account"}
          </button>
        </header>

        {loadError && (
          <div className="card mb-12" style={{ borderColor: "var(--red)" }}>
            <p className="subtle" style={{ margin: 0, color: "var(--red)" }}>{loadError}</p>
          </div>
        )}
        {notice && view === "home" && (
          <div className="card mb-12" style={{ borderColor: "var(--amber)" }}>
            <p className="subtle" style={{ margin: 0, color: "var(--amber)" }}>{notice}</p>
          </div>
        )}

        {view === "home" && (
          <Home setView={setView} stats={stats} elo={elo} players={players} gameCount={gameCount} results={results} openProfile={openProfile} />
        )}
        {view === "setup" && (
          <Setup
            players={players}
            addPlayer={addPlayer}
            me={session.user?.user_metadata?.display_name || ""}
            onStart={(game) => {
              liveProgress.current = null;
              setLive(game);
              setView(
                game.gameType === "x01" ? "playX01" : game.gameType === "cricket" ? "playCricket" : "playBaseball"
              );
            }}
            back={() => setView("home")}
          />
        )}
        {["playX01", "playCricket", "playBaseball"].includes(view) && live && castAvailable() && (
          <div className="card pad-sm mb-12" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {castCode ? (
              <>
                <CastIcon />
                <span className="tag" style={{ letterSpacing: 0, textTransform: "none" }}>TV code</span>
                <span className="num" style={{ fontSize: "calc(17px * var(--fs))", letterSpacing: "0.25em" }}>{castCode}</span>
                <span className="tag" style={{ flex: 1, letterSpacing: 0, textTransform: "none", textAlign: "right" }}>
                  open {typeof window !== "undefined" ? window.location.host : ""}/tv
                </span>
                <button className="btn" style={{ padding: "6px 12px" }} onClick={toggleCast}>
                  Stop
                </button>
              </>
            ) : (
              <button
                className="btn"
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                onClick={toggleCast}
              >
                <CastIcon /> Cast to TV
              </button>
            )}
          </div>
        )}
        {view === "playX01" && live && <PlayX01 game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} />}
        {view === "playCricket" && live && <PlayCricket game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} />}
        {view === "playBaseball" && live && <PlayBaseball game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} />}
        {view === "leaderboard" && (
          <Leaderboard usernames={visibleUsernames} stats={stats} elo={elo} openProfile={openProfile} back={() => setView("home")} />
        )}
        {view === "profile" && profileUser && (
          <Profile
            user={profileUser}
            stats={stats[profileUser]}
            elo={elo[profileUser]}
            results={results}
            onOpenAccount={
              profileUser === (session.user?.user_metadata?.display_name || "")
                ? () => setView("account")
                : null
            }
            back={() => setView("leaderboard")}
          />
        )}
        {view === "matchup" && (
          <Matchup usernames={visibleUsernames} elo={elo} results={results} stats={stats} back={() => setView("home")} />
        )}
        {view === "insights" && (
          <Insights usernames={visibleUsernames} stats={stats} elo={elo} results={results} gameCount={gameCount} back={() => setView("home")} />
        )}
        {view === "account" && (
          <Account
            user={session.user}
            players={players}
            addPlayer={addPlayer}
            setPlayerHidden={setPlayerHidden}
            isAdmin={isAdmin}
            onOpenAdmin={() => setView("admin")}
            signOut={signOut}
            back={() => setView("home")}
          />
        )}
        {view === "admin" && isAdmin && (
          <Admin stats={stats} addPlayer={addPlayer} refreshData={refresh} back={() => setView("account")} />
        )}

        </div>
      </div>
      <nav className="nav">
        <button className={`navbtn ${view === "home" ? "active" : ""}`} onClick={() => setView("home")}>Home</button>
        <button className={`navbtn ${["setup", "playX01", "playCricket", "playBaseball"].includes(view) ? "active" : ""}`} onClick={goPlay}>Play{live ? " ●" : ""}</button>
        <button className={`navbtn ${["leaderboard", "profile"].includes(view) ? "active" : ""}`} onClick={() => setView("leaderboard")}>Stats</button>
        <button className={`navbtn ${view === "matchup" ? "active" : ""}`} onClick={() => setView("matchup")}>Matchup</button>
        <button className={`navbtn ${view === "insights" ? "active" : ""}`} onClick={() => setView("insights")}>AI</button>
      </nav>
    </main>
  );
}
