"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import { getPlayers, addPlayer as dbAddPlayer, setPlayerHidden as dbSetPlayerHidden, setPlayerColor as dbSetPlayerColor, getGameResults, recordGame } from "@/lib/db";
import { computeStats, eloMapFromPlayers, applyEloUpdate } from "@/lib/stats";
import { ACCENTS, ADMIN_EMAIL, defaultPlayerColor } from "@/lib/constants";
import { applyFontScale } from "@/lib/prefs";
import { applySkin } from "@/lib/skins";
import { makeCastCode, openCastChannel, castAvailable, stripHistory } from "@/lib/cast";
import { Logo, GearIcon, CastIcon, PlayerBadge } from "@/components/ui";
import Auth from "@/components/Auth";
import Home from "@/components/Home";
import Setup from "@/components/Setup";
import PlayX01 from "@/components/PlayX01";
import PlayCricket from "@/components/PlayCricket";
import PlayBaseball from "@/components/PlayBaseball";
import PlayAroundTheClock from "@/components/PlayAroundTheClock";
import PlayKiller from "@/components/PlayKiller";
import PlayShanghai from "@/components/PlayShanghai";
import PlayHalveIt from "@/components/PlayHalveIt";
import PlayGotcha from "@/components/PlayGotcha";
import PlayTicTacToe from "@/components/PlayTicTacToe";
import Leaderboard from "@/components/Leaderboard";
import Profile from "@/components/Profile";
import Matchup from "@/components/Matchup";
import Insights from "@/components/Insights";
import Records from "@/components/Records";
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

  // ---- live-game persistence: a page reload no longer loses the leg ----
  // Scoped to the signed-in account (a shared device never hands one
  // user's game to another). The undo history is stripped before writing:
  // it grows quadratically and in-session resume keeps it in memory.
  const LIVE_KEY = "bb-live-game";
  const sessionUserIdRef = useRef(null);
  // true from finishMatch/quit until the next game starts; blocks the play
  // component's trailing onProgress (fired while finishMatch awaits the
  // network) from resurrecting the cleared key or re-arming the cast timer
  const finishingRef = useRef(false);
  const restoredForUser = useRef(null);

  const persistLive = useCallback((game, progress) => {
    const uid = sessionUserIdRef.current;
    if (!uid) return;
    try {
      if (game) {
        window.localStorage.setItem(LIVE_KEY, JSON.stringify({ userId: uid, game, progress: stripHistory(progress) }));
      } else {
        window.localStorage.removeItem(LIVE_KEY);
      }
    } catch {}
  }, []);

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
    if (finishingRef.current) return; // trailing update after finish/quit
    liveProgress.current = p;
    persistLive(liveGameRef.current, p);
    if (!castChannel.current) return;
    const wait = Math.max(0, 200 - (Date.now() - lastCastAt.current));
    if (castTimer.current) clearTimeout(castTimer.current);
    castTimer.current = setTimeout(() => {
      lastCastAt.current = Date.now();
      sendCastState();
    }, wait);
  }, [sendCastState, persistLive]);

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

  useEffect(() => {
    sessionUserIdRef.current = session?.user?.id || null;
  }, [session]);

  // restore a persisted live game for THIS account, once per sign-in
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || live || restoredForUser.current === uid) return;
    restoredForUser.current = uid;
    try {
      const raw = window.localStorage.getItem(LIVE_KEY);
      if (!raw) return;
      const { userId, game, progress } = JSON.parse(raw);
      if (userId !== uid) return; // someone else's leg on a shared device
      if (game && game.gameType && Array.isArray(game.players)) {
        liveProgress.current = progress || null;
        liveGameRef.current = game;
        setLive(game);
        setNotice("Live game restored — open Play to continue.");
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, live]);

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
  const playerColors = useMemo(
    () => Object.fromEntries(players.map((p) => [p.username, p.color || defaultPlayerColor(p.username)])),
    [players]
  );
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

  const setPlayerColor = useCallback(async (username, color) => {
    await dbSetPlayerColor(username, color);
    await refresh();
  }, [refresh]);

  const finishMatch = useCallback(async (match) => {
    // block the play component's trailing onProgress (it re-renders while
    // we await the network below) from resurrecting the persisted game or
    // re-arming the cast timer after "finished"
    finishingRef.current = true;
    if (castTimer.current) clearTimeout(castTimer.current);
    liveProgress.current = null;
    persistLive(null);
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
    finishingRef.current = true;
    if (castTimer.current) clearTimeout(castTimer.current);
    liveProgress.current = null;
    persistLive(null);
    if (castChannel.current) castChannel.current.send("ended", {});
    setLive(null);
    setNotice("");
    setView("home");
  };

  const PLAY_VIEWS = { x01: "playX01", cricket: "playCricket", baseball: "playBaseball", aroundTheClock: "playAroundTheClock", killer: "playKiller", shanghai: "playShanghai", halveit: "playHalveIt", gotcha: "playGotcha", tictactoe: "playTicTacToe" };
  const ALL_PLAY_VIEWS = Object.values(PLAY_VIEWS);
  const playViewFor = (gt) => PLAY_VIEWS[gt] || "playX01";
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
            style={{
              padding: "6px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={() => {
              const me = session.user?.user_metadata?.display_name;
              if (me) openProfile(me);
              else setView("account");
            }}
            title="Your stats & card"
            aria-label="Your profile"
          >
            <PlayerBadge username={session.user?.user_metadata?.display_name || "?"} color={playerColors[session.user?.user_metadata?.display_name]} size={28} showName={false} />
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
          <Home setView={setView} stats={stats} elo={elo} players={players} gameCount={gameCount} results={results} openProfile={openProfile} playerColors={playerColors} />
        )}
        {view === "setup" && (
          <Setup
            players={players}
            addPlayer={addPlayer}
            playerColors={playerColors}
            me={session.user?.user_metadata?.display_name || ""}
            onStart={(game) => {
              finishingRef.current = false;
              liveProgress.current = null;
              // sync the ref now: the play component's first onProgress fires
              // before the ref-syncing effect on this same commit
              liveGameRef.current = game;
              persistLive(game, null);
              setLive(game);
              setView(playViewFor(game.gameType));
            }}
            back={() => setView("home")}
          />
        )}
        {ALL_PLAY_VIEWS.includes(view) && live && castAvailable() && (
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
        {view === "playX01" && live && <PlayX01 game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} playerColors={playerColors} />}
        {view === "playCricket" && live && <PlayCricket game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} playerColors={playerColors} />}
        {view === "playBaseball" && live && <PlayBaseball game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} playerColors={playerColors} />}
        {view === "playAroundTheClock" && live && <PlayAroundTheClock game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} playerColors={playerColors} />}
        {view === "playKiller" && live && <PlayKiller game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} playerColors={playerColors} />}
        {view === "playShanghai" && live && <PlayShanghai game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} playerColors={playerColors} />}
        {view === "playHalveIt" && live && <PlayHalveIt game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} playerColors={playerColors} />}
        {view === "playGotcha" && live && <PlayGotcha game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} playerColors={playerColors} />}
        {view === "playTicTacToe" && live && <PlayTicTacToe game={live} resume={liveProgress.current} onProgress={saveProgress} onFinish={finishMatch} onQuit={quit} castActive={!!castCode} playerColors={playerColors} />}
        {view === "leaderboard" && (
          <Leaderboard usernames={visibleUsernames} stats={stats} elo={elo} openProfile={openProfile} openRecords={() => setView("records")} back={() => setView("home")} playerColors={playerColors} />
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
            playerColors={playerColors}
            back={() => setView("leaderboard")}
          />
        )}
        {view === "records" && (
          <Records usernames={visibleUsernames} stats={stats} results={results} back={() => setView("leaderboard")} playerColors={playerColors} />
        )}
        {view === "matchup" && (
          <Matchup usernames={visibleUsernames} elo={elo} results={results} stats={stats} back={() => setView("home")} playerColors={playerColors} />
        )}
        {view === "insights" && (
          <Insights usernames={visibleUsernames} stats={stats} elo={elo} results={results} gameCount={gameCount} back={() => setView("home")} />
        )}
        {view === "account" && (
          <Account
            user={session.user}
            players={players}
            results={results}
            addPlayer={addPlayer}
            setPlayerHidden={setPlayerHidden}
            setPlayerColor={setPlayerColor}
            playerColors={playerColors}
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
        <button className={`navbtn ${view === "setup" || ALL_PLAY_VIEWS.includes(view) ? "active" : ""}`} onClick={goPlay}>Play{live ? " ●" : ""}</button>
        <button className={`navbtn ${["leaderboard", "profile", "records"].includes(view) ? "active" : ""}`} onClick={() => setView("leaderboard")}>Stats</button>
        <button className={`navbtn ${view === "matchup" ? "active" : ""}`} onClick={() => setView("matchup")}>Matchup</button>
        <button className={`navbtn ${view === "insights" ? "active" : ""}`} onClick={() => setView("insights")}>AI</button>
      </nav>
    </main>
  );
}
