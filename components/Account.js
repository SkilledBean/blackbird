import { useState } from "react";
import { BackBar } from "./ui";
import { supabase } from "@/lib/supabase";
import { ACCENTS, FONT_SCALES } from "@/lib/constants";
import { applyFontScale } from "@/lib/prefs";

export default function Account({ user, players, results, addPlayer, setPlayerHidden, isAdmin, onOpenAdmin, signOut, back }) {
  const meta = user?.user_metadata || {};
  const [name, setName] = useState(meta.display_name || "");
  const [theme, setTheme] = useState(["dark", "glass"].includes(meta.theme) ? meta.theme : "light");
  const [accent, setAccent] = useState(
    meta.accent && (meta.accent.charAt(0) === "#" || ACCENTS[meta.accent]) ? meta.accent : "green"
  );
  const [fontScale, setFontScale] = useState(
    FONT_SCALES.some((f) => f.id === meta.fontScale) ? meta.fontScale : "normal"
  );
  const [msg, setMsg] = useState("");
  const [good, setGood] = useState(false);
  const [busy, setBusy] = useState(false);

  const hexFor = (a) => (a.charAt(0) === "#" ? a : ACCENTS[a] || ACCENTS.green);
  const isCustom = accent.charAt(0) === "#";

  const persist = async (patch) => {
    try {
      await supabase.auth.updateUser({ data: { ...(user.user_metadata || {}), ...patch } });
    } catch (e) {
      // preference still applied locally
    }
  };

  const saveName = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { error } = await supabase.auth.updateUser({
        data: { ...(user.user_metadata || {}), display_name: name.trim() },
      });
      if (error) throw error;
      setGood(true);
      setMsg("Display name saved.");
    } catch (e) {
      setGood(false);
      setMsg(e.message || "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const applyTheme = (t) => {
    setTheme(t);
    if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
    persist({ theme: t });
  };

  const applyAccent = (value) => {
    setAccent(value);
    if (typeof document !== "undefined")
      document.documentElement.style.setProperty("--accent", hexFor(value));
    persist({ accent: value });
  };

  const applyTextSize = (id) => {
    setFontScale(id);
    applyFontScale(id);
    persist({ fontScale: id });
  };

  const trimmed = name.trim();
  const myPlayer = players.find((p) => p.username.toLowerCase() === trimmed.toLowerCase());
  const isPlayer = !!myPlayer;
  const [hideBusy, setHideBusy] = useState(false);

  const toggleLeaderboard = async () => {
    if (!myPlayer) return;
    setHideBusy(true);
    try {
      await setPlayerHidden(myPlayer.username, !myPlayer.hidden);
    } finally {
      setHideBusy(false);
    }
  };

  const exportData = (format) => {
    const me = trimmed.toLowerCase();
    const myResults = results.filter((r) => r.username.toLowerCase() === me);
    const rows = myResults.length > 0 ? myResults : results;
    let blob;
    let filename;
    if (format === "json") {
      blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      filename = "blackbird-results.json";
    } else {
      const cols = ["gameId", "gameType", "username", "result", "opponents", "completedAt"];
      const lines = [cols.join(",")];
      for (const r of rows) {
        lines.push(cols.map((c) => {
          const v = r[c];
          if (Array.isArray(v)) return `"${v.join(";")}"`;
          if (typeof v === "string" && v.includes(",")) return `"${v}"`;
          return v == null ? "" : v;
        }).join(","));
      }
      blob = new Blob([lines.join("\n")], { type: "text/csv" });
      filename = "blackbird-results.csv";
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const addMe = async () => {
    const ok = await addPlayer(trimmed);
    setGood(ok);
    setMsg(ok ? `Added "${trimmed}" to the player list.` : "That name is already a player.");
  };

  return (
    <div className="fade">
      <BackBar back={back} title="Account" />

      <div className="card mb-12">
        <div className="tag" style={{ marginBottom: 6 }}>
          Signed in as
        </div>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>{user?.email}</div>

        <div className="tag" style={{ marginBottom: 6 }}>
          Display name
        </div>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
        />
        {msg && (
          <p className="subtle" style={{ marginBottom: 0, color: good ? "var(--accent)" : "var(--red)" }}>
            {msg}
          </p>
        )}
        <button
          className="btn btn-primary mt-12"
          style={{ width: "100%" }}
          onClick={saveName}
          disabled={busy || !trimmed || trimmed === (meta.display_name || "")}
        >
          {busy ? "Saving…" : "Save display name"}
        </button>
      </div>

      <div className="card mb-12">
        <div className="tag" style={{ marginBottom: 10 }}>
          Appearance
        </div>

        <div className="tag" style={{ marginBottom: 6 }}>
          Theme
        </div>
        <div className="row">
          <button
            className={`btn ${theme === "light" ? "btn-toggle-on" : ""}`}
            style={{ flex: 1 }}
            onClick={() => applyTheme("light")}
          >
            Light
          </button>
          <button
            className={`btn ${theme === "dark" ? "btn-toggle-on" : ""}`}
            style={{ flex: 1 }}
            onClick={() => applyTheme("dark")}
          >
            Dark
          </button>
          <button
            className={`btn ${theme === "glass" ? "btn-toggle-on" : ""}`}
            style={{ flex: 1 }}
            onClick={() => applyTheme("glass")}
          >
            Glass
          </button>
        </div>

        <div className="tag" style={{ margin: "14px 0 6px" }}>
          Text size
        </div>
        <div className="grid-4">
          {FONT_SCALES.map((f) => (
            <button
              key={f.id}
              className={`btn ${fontScale === f.id ? "btn-toggle-on" : ""}`}
              onClick={() => applyTextSize(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div
          className="card pad-sm mt-12"
          style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10 }}
        >
          <span className="num" style={{ fontSize: "calc(34px * var(--fs))", color: "var(--accent)" }}>
            180
          </span>
          <span className="subtle">preview — how scores will look</span>
        </div>

        <div className="tag" style={{ margin: "14px 0 8px" }}>
          Accent color
        </div>
        <div className="flex-wrap" style={{ alignItems: "center" }}>
          {Object.entries(ACCENTS).map(([key, hex]) => (
            <button
              key={key}
              onClick={() => applyAccent(key)}
              aria-label={key}
              title={key}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: hex,
                cursor: "pointer",
                border: accent === key ? "3px solid var(--ink)" : "2px solid var(--line)",
              }}
            />
          ))}
          <label
            title="Custom color"
            style={{
              position: "relative",
              width: 36,
              height: 36,
              borderRadius: 10,
              cursor: "pointer",
              overflow: "hidden",
              border: isCustom ? "3px solid var(--ink)" : "2px solid var(--line)",
              background: isCustom
                ? accent
                : "conic-gradient(#e03a3a,#ea962b,#0e8c5a,#2563eb,#7c3aed,#e03a3a)",
            }}
          >
            <input
              type="color"
              value={isCustom ? accent : "#0e8c5a"}
              onChange={(e) => applyAccent(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
            />
          </label>
        </div>
        <p className="tag" style={{ marginTop: 8, textTransform: "none", letterSpacing: 0 }}>
          Tap the rainbow swatch for a custom color.
        </p>
      </div>

      <div className="card mb-12">
        <div className="tag" style={{ marginBottom: 10 }}>
          Player profile
        </div>
        {!trimmed ? (
          <p className="subtle" style={{ margin: 0 }}>Set a display name above first.</p>
        ) : isPlayer ? (
          <>
            <p className="subtle" style={{ marginTop: 0, marginBottom: 14 }}>
              You&apos;re in the player list as <strong>{trimmed}</strong> — your stats show up under
              that name.
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                paddingTop: 14,
                borderTop: "1px solid var(--line)",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>Show on leaderboard</div>
                <div className="tag" style={{ textTransform: "none", letterSpacing: 0, marginTop: 2 }}>
                  {myPlayer.hidden ? "You're hidden from the standings." : "You're visible in the standings."}
                </div>
              </div>
              <button
                className={`btn ${myPlayer.hidden ? "" : "btn-toggle-on"}`}
                style={{ minWidth: 92 }}
                onClick={toggleLeaderboard}
                disabled={hideBusy}
              >
                {hideBusy ? "…" : myPlayer.hidden ? "Show me" : "Hide me"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="subtle" style={{ marginTop: 0 }}>
              Add yourself to the shared player list so you can be picked in games and tracked in
              the standings.
            </p>
            <button className="btn" style={{ width: "100%" }} onClick={addMe}>
              Add &quot;{trimmed}&quot; as a player
            </button>
          </>
        )}
      </div>

      {results && results.length > 0 && (
        <div className="card mb-12">
          <div className="tag" style={{ marginBottom: 10 }}>Export data</div>
          <p className="subtle" style={{ marginTop: 0 }}>
            Download your game results as CSV or JSON.
          </p>
          <div className="row">
            <button className="btn" style={{ flex: 1 }} onClick={() => exportData("csv")}>
              Export CSV
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={() => exportData("json")}>
              Export JSON
            </button>
          </div>
        </div>
      )}

      {isAdmin && (
        <button
          className="btn mb-12"
          style={{ width: "100%" }}
          onClick={onOpenAdmin}
        >
          Open admin panel
        </button>
      )}

      <button className="btn btn-danger" style={{ width: "100%" }} onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
