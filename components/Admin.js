import { useEffect, useState, useCallback, useRef } from "react";
import { BackBar, PlayerBadge } from "./ui";
import { supabase } from "@/lib/supabase";
import { SKINS } from "@/lib/skins";
import { defaultPlayerColor } from "@/lib/constants";

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}

async function callAdmin(payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function DropdownMenu({ items, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} style={{
      position: "absolute", top: "100%", right: 0, marginTop: 4,
      background: "var(--surface)", border: "1px solid var(--line)",
      borderRadius: 12, padding: "6px 0", minWidth: 180, zIndex: 10,
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    }}>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.action(); onClose(); }}
          disabled={item.disabled}
          style={{
            display: "block", width: "100%", padding: "10px 16px",
            background: "none", border: "none", cursor: item.disabled ? "default" : "pointer",
            textAlign: "left", fontSize: "calc(14px * var(--fs))", fontFamily: "inherit",
            color: item.danger ? "var(--red)" : "var(--ink)",
            opacity: item.disabled ? 0.4 : 1,
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function Admin({ stats, addPlayer, back, refreshData, playerColors }) {
  const [data, setData] = useState(null);
  const [edits, setEdits] = useState({});
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");
  const [newName, setNewName] = useState("");
  const [openMenu, setOpenMenu] = useState(null);
  const [editing, setEditing] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameTo, setRenameTo] = useState("");
  const [skin, setSkin] = useState("default");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSkin(data?.session?.user?.user_metadata?.skin || "default");
    });
  }, []);

  const pickSkin = async (id) => {
    setBusy("skin");
    try {
      const { error } = await supabase.auth.updateUser({ data: { skin: id } });
      if (error) throw error;
      window.location.reload();
    } catch (e) {
      setErr(e.message || "Could not switch theme.");
      setBusy("");
    }
  };

  const load = useCallback(async () => {
    setErr("");
    try {
      const j = await callAdmin({ action: "list" });
      setData(j);
      const e = {};
      (j.users || []).forEach((u) => {
        e[u.id] = { email: u.email, password: "", displayName: u.displayName };
      });
      setEdits(e);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m) => {
    setOk(m);
    setErr("");
    setTimeout(() => setOk(""), 2500);
  };

  const saveUser = async (id) => {
    const e = edits[id];
    if (!e) return;
    setBusy(id);
    setErr("");
    try {
      await callAdmin({
        action: "updateUser",
        userId: id,
        email: e.email,
        password: e.password || undefined,
        displayName: e.displayName,
      });
      flash("Account updated.");
      await load();
    } catch (er) {
      setErr(er.message);
    } finally {
      setBusy("");
    }
  };

  const deleteUser = async (id, email) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete the login account for ${email}? This removes their ability to sign in.`)) return;
    setBusy(id);
    setErr("");
    try {
      await callAdmin({ action: "deleteUser", userId: id });
      flash("Account deleted.");
      await load();
      refreshData && refreshData();
    } catch (er) {
      setErr(er.message);
    } finally {
      setBusy("");
    }
  };

  const removePlayer = async (username) => {
    if (typeof window !== "undefined" && !window.confirm(`Remove "${username}" from the player list and delete all their game history?`)) return;
    setBusy("p:" + username);
    setErr("");
    try {
      await callAdmin({ action: "deletePlayer", username });
      flash(`Removed ${username}.`);
      await load();
      refreshData && refreshData();
    } catch (er) {
      setErr(er.message);
    } finally {
      setBusy("");
    }
  };

  const resetScore = async (username, games) => {
    const msg =
      `Reset ${username}'s score?\n\n` +
      `This deletes the ${games} game${games === 1 ? "" : "s"} on their record and sets their Elo back to 1000. ` +
      `Everyone else keeps their own records untouched. This can't be undone.`;
    if (typeof window !== "undefined" && !window.confirm(msg)) return;
    setBusy("p:" + username);
    setErr("");
    try {
      await callAdmin({ action: "resetScore", username });
      flash(`Reset ${username}'s score.`);
      await load();
      refreshData && refreshData();
    } catch (er) {
      setErr(er.message);
    } finally {
      setBusy("");
    }
  };

  const addNewPlayer = async () => {
    const u = newName.trim();
    if (!u) return;
    setBusy("add");
    setErr("");
    try {
      const okAdd = await addPlayer(u);
      if (okAdd) {
        flash(`Added ${u}.`);
        setNewName("");
        await load();
        refreshData && refreshData();
      } else {
        setErr("That name is already a player.");
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  };

  const togglePlayerHidden = async (username, hidden) => {
    setBusy("p:" + username);
    setErr("");
    try {
      await callAdmin({ action: "setHidden", username, hidden: !hidden });
      await load();
      refreshData && refreshData();
    } catch (er) {
      setErr(er.message);
    } finally {
      setBusy("");
    }
  };

  const renamePlayer = async (oldName) => {
    const trimmed = renameTo.trim();
    if (!trimmed || trimmed === oldName) { setRenaming(null); return; }
    setBusy("p:" + oldName);
    setErr("");
    try {
      await callAdmin({ action: "renamePlayer", oldName, newName: trimmed });
      flash(`Renamed "${oldName}" to "${trimmed}".`);
      setRenaming(null);
      setRenameTo("");
      await load();
      refreshData && refreshData();
    } catch (er) {
      setErr(er.message);
    } finally {
      setBusy("");
    }
  };

  const linkPlayer = async (username, authId) => {
    setBusy("p:" + username);
    setErr("");
    try {
      await callAdmin({ action: "linkPlayer", username, authId });
      flash(authId ? `Linked ${username} to account.` : `Unlinked ${username}.`);
      await load();
      refreshData && refreshData();
    } catch (er) {
      setErr(er.message);
    } finally {
      setBusy("");
    }
  };

  const setEdit = (id, key, val) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: val } }));

  const merged = [];
  if (data) {
    const userByName = {};
    for (const u of data.users) {
      const dn = (u.displayName || "").toLowerCase();
      if (dn) userByName[dn] = u;
    }
    const usedUserIds = new Set();

    for (const p of data.players) {
      let account = null;
      if (p.authId) {
        account = data.users.find((u) => u.id === p.authId) || null;
      }
      if (!account) {
        account = userByName[(p.username || "").toLowerCase()] || null;
      }
      if (account) usedUserIds.add(account.id);
      merged.push({ player: p, account });
    }

    for (const u of data.users) {
      if (!usedUserIds.has(u.id)) {
        merged.push({ player: null, account: u });
      }
    }
  }

  return (
    <div className="fade">
      <BackBar back={back} title="Admin panel" />

      {err && (
        <div className="card mb-12" style={{ borderColor: "var(--red)" }}>
          <p className="subtle" style={{ margin: 0, color: "var(--red)" }}>{err}</p>
        </div>
      )}
      {ok && (
        <div className="card mb-12" style={{ borderColor: "var(--accent)" }}>
          <p className="subtle" style={{ margin: 0, color: "var(--accent)" }}>{ok}</p>
        </div>
      )}

      <div className="card mb-12">
        <div className="tag" style={{ marginBottom: 4 }}>Theme lab</div>
        <p className="subtle" style={{ marginTop: 4 }}>
          Applies only to your account. Reloads the app when selected.
        </p>
        <div className="grid-4">
          {SKINS.map((s) => (
            <button
              key={s.id}
              className={`btn ${skin === s.id ? "btn-toggle-on" : ""}`}
              disabled={busy === "skin" || skin === s.id}
              title={s.blurb}
              onClick={() => pickSkin(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="card">
          <p className="subtle" style={{ margin: 0 }}>Loading…</p>
        </div>
      ) : (
        <>
          <div className="card mb-12">
            <div className="tag" style={{ marginBottom: 8 }}>Add new player</div>
            <div className="row">
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addNewPlayer(); }}
                placeholder="Player name"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                style={{ flex: "none", minWidth: 88 }}
                disabled={busy === "add" || !newName.trim()}
                onClick={addNewPlayer}
              >
                {busy === "add" ? "Adding…" : "Add"}
              </button>
            </div>
          </div>

          <div className="tag" style={{ marginBottom: 10 }}>
            People ({merged.length})
          </div>

          <div className="stack mb-12">
            {merged.length === 0 && (
              <div className="card">
                <p className="subtle" style={{ margin: 0 }}>No players or accounts yet.</p>
              </div>
            )}
            {merged.map((entry) => {
              const { player: p, account: acct } = entry;
              const username = p?.username || acct?.displayName || "?";
              const s = stats[username] || { games: 0, wins: 0, winPct: 0, x01: { threeDartAvg: 0 } };
              const key = p ? "p:" + p.username : "u:" + acct.id;
              const busyHere = busy === key || busy === "p:" + username || (acct && busy === acct.id);
              const isRenaming = renaming === username;
              const isEditing = editing === username;
              const hasAccount = !!acct;
              const hasPlayer = !!p;
              const color = playerColors?.[username] || defaultPlayerColor(username);

              const menuItems = [];
              if (hasPlayer) {
                menuItems.push({ label: "Rename", action: () => { setRenaming(username); setRenameTo(username); } });
                menuItems.push({ label: p.hidden ? "Show on leaderboard" : "Hide from leaderboard", action: () => togglePlayerHidden(username, p.hidden) });
                menuItems.push({ label: "Reset score", danger: true, action: () => resetScore(username, s.games) });
                menuItems.push({ label: "Remove player", danger: true, action: () => removePlayer(username) });
              }
              if (hasAccount) {
                menuItems.push({ label: "Edit account", action: () => setEditing(isEditing ? null : username) });
                menuItems.push({ label: "Delete account", danger: true, action: () => deleteUser(acct.id, acct.email) });
              }
              if (hasPlayer && !hasAccount) {
                const matchable = data.users.filter((u) => !data.players.some((pp) => pp.authId === u.id));
                if (matchable.length > 0) {
                  menuItems.push({ label: "Link to account…", action: () => setEditing(username) });
                }
              }
              if (hasPlayer && hasAccount && p.authId) {
                menuItems.push({ label: "Unlink account", action: () => linkPlayer(username, null) });
              }

              return (
                <div className="card" key={key}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    {isRenaming ? (
                      <div className="row" style={{ flex: 1, minWidth: 0 }}>
                        <input
                          className="input"
                          value={renameTo}
                          onChange={(e) => setRenameTo(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") renamePlayer(username); if (e.key === "Escape") setRenaming(null); }}
                          placeholder="New name"
                          autoFocus
                          style={{ flex: 1 }}
                        />
                        <button className="btn btn-primary" style={{ flex: "none", minWidth: 64 }} disabled={busyHere || !renameTo.trim() || renameTo.trim() === username} onClick={() => renamePlayer(username)}>
                          {busyHere ? "…" : "Save"}
                        </button>
                        <button className="btn" style={{ flex: "none" }} onClick={() => setRenaming(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <PlayerBadge username={username} color={color} size={32} showName={false} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: "calc(16px * var(--fs))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {username}
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                            {hasAccount && (
                              <span className="tag" style={{ background: "var(--accent-soft)", color: "var(--accent)", padding: "2px 8px", borderRadius: 999, fontSize: "calc(10px * var(--fs-chrome))" }}>
                                logged in
                              </span>
                            )}
                            {!hasAccount && hasPlayer && (
                              <span className="tag" style={{ background: "var(--surface-2)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 999, fontSize: "calc(10px * var(--fs-chrome))" }}>
                                no account
                              </span>
                            )}
                            {p?.hidden && (
                              <span className="tag" style={{ background: "var(--surface-2)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 999, fontSize: "calc(10px * var(--fs-chrome))" }}>
                                hidden
                              </span>
                            )}
                            {!hasPlayer && hasAccount && (
                              <span className="tag" style={{ background: "var(--surface-2)", border: "1px solid var(--line)", padding: "2px 8px", borderRadius: 999, fontSize: "calc(10px * var(--fs-chrome))" }}>
                                account only
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ position: "relative", flex: "none" }}>
                          <button
                            className="btn"
                            style={{ padding: "6px 8px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            onClick={() => setOpenMenu(openMenu === username ? null : username)}
                            aria-label="Actions"
                          >
                            <DotsIcon />
                          </button>
                          {openMenu === username && (
                            <DropdownMenu items={menuItems} onClose={() => setOpenMenu(null)} />
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {hasPlayer && (
                    <div className="grid-4" style={{ marginBottom: isEditing ? 12 : 0 }}>
                      <div className="mini">
                        <div className="num">{s.games}</div>
                        <div className="tag" style={{ marginTop: 2, fontSize: "calc(10px * var(--fs-chrome))" }}>games</div>
                      </div>
                      <div className="mini">
                        <div className="num">{s.wins}</div>
                        <div className="tag" style={{ marginTop: 2, fontSize: "calc(10px * var(--fs-chrome))" }}>wins</div>
                      </div>
                      <div className="mini">
                        <div className="num">{s.games ? Math.round(s.winPct) + "%" : "—"}</div>
                        <div className="tag" style={{ marginTop: 2, fontSize: "calc(10px * var(--fs-chrome))" }}>win rate</div>
                      </div>
                      <div className="mini">
                        <div className="num">{s.x01 && s.x01.threeDartAvg ? s.x01.threeDartAvg.toFixed(1) : "—"}</div>
                        <div className="tag" style={{ marginTop: 2, fontSize: "calc(10px * var(--fs-chrome))" }}>3-dart avg</div>
                      </div>
                    </div>
                  )}

                  {isEditing && hasAccount && (() => {
                    const e = edits[acct.id] || { email: "", password: "", displayName: "" };
                    return (
                      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: hasPlayer ? 0 : 0 }}>
                        <div style={{ marginBottom: 12 }}>
                          <div className="tag" style={{ marginBottom: 6 }}>Email</div>
                          <input
                            className="input"
                            value={e.email}
                            onChange={(ev) => setEdit(acct.id, "email", ev.target.value)}
                            placeholder="email"
                            autoCapitalize="none"
                          />
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <div className="tag" style={{ marginBottom: 6 }}>Reset password</div>
                          <input
                            className="input"
                            type="text"
                            value={e.password}
                            onChange={(ev) => setEdit(acct.id, "password", ev.target.value)}
                            placeholder="new password (leave blank to keep)"
                            autoCapitalize="none"
                          />
                        </div>
                        <p className="tag" style={{ textTransform: "none", letterSpacing: 0, margin: "0 0 12px" }}>
                          Joined {fmtDate(acct.createdAt)}
                        </p>
                        <div className="row">
                          <button
                            className="btn btn-primary"
                            style={{ flex: 1 }}
                            disabled={busyHere}
                            onClick={() => saveUser(acct.id)}
                          >
                            {busyHere ? "Saving…" : "Save"}
                          </button>
                          <button className="btn" style={{ flex: "none" }} onClick={() => setEditing(null)}>
                            Done
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {isEditing && !hasAccount && hasPlayer && (() => {
                    const unlinkedUsers = data.users.filter((u) => !data.players.some((pp) => pp.authId === u.id));
                    return (
                      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                        <div className="tag" style={{ marginBottom: 6 }}>Link to an account</div>
                        {unlinkedUsers.length === 0 ? (
                          <p className="subtle" style={{ margin: 0 }}>No unlinked accounts available.</p>
                        ) : (
                          <div className="row">
                            <select
                              className="select"
                              style={{ flex: 1 }}
                              defaultValue=""
                              onChange={(ev) => {
                                if (ev.target.value) linkPlayer(username, ev.target.value);
                                setEditing(null);
                              }}
                            >
                              <option value="">Select an account…</option>
                              {unlinkedUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.displayName || u.email}
                                </option>
                              ))}
                            </select>
                            <button className="btn" style={{ flex: "none" }} onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
