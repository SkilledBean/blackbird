import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "matthews@finishessolutions.com").toLowerCase();

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) return json({ error: "Server is not configured (Supabase URL / anon key missing)." }, 500);

  // 1) verify the caller is signed in
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return json({ error: "Not signed in." }, 401);

  const caller = createClient(url, anon);
  const { data: who, error: whoErr } = await caller.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: "Session invalid. Sign in again." }, 401);

  // 2) verify the caller is the admin
  if ((who.user.email || "").toLowerCase() !== ADMIN_EMAIL) {
    return json({ error: "You are not allowed to use the admin panel." }, 403);
  }

  // 3) the admin client needs the service_role key
  if (!serviceKey) {
    return json(
      { error: "Admin features need SUPABASE_SERVICE_ROLE_KEY set on the server (Vercel env var)." },
      500
    );
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const action = body?.action;

  try {
    if (action === "list") {
      const { data: list, error: le } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (le) throw le;
      const users = (list?.users || []).map((u) => ({
        id: u.id,
        email: u.email || "",
        displayName: u.user_metadata?.display_name || "",
        createdAt: u.created_at,
      }));
      const { data: players, error: pe } = await admin
        .from("players")
        .select("username, hidden, created_at")
        .order("created_at", { ascending: true });
      if (pe) throw pe;
      return json({
        users,
        players: (players || []).map((p) => ({
          username: p.username,
          hidden: !!p.hidden,
          createdAt: p.created_at,
        })),
      });
    }

    if (action === "updateUser") {
      const { userId, email, password, displayName } = body;
      if (!userId) return json({ error: "Missing user." }, 400);
      const attrs = {};
      if (email) attrs.email = email;
      if (password) attrs.password = password;
      if (typeof displayName === "string") {
        // merge so we don't wipe the user's theme/accent settings
        const { data: existing } = await admin.auth.admin.getUserById(userId);
        const meta = existing?.user?.user_metadata || {};
        attrs.user_metadata = { ...meta, display_name: displayName };
      }
      if (Object.keys(attrs).length === 0) return json({ error: "Nothing to change." }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, attrs);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "deleteUser") {
      const { userId } = body;
      if (!userId) return json({ error: "Missing user." }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "deletePlayer") {
      const { username } = body;
      if (!username) return json({ error: "Missing player." }, 400);
      await admin.from("game_results").delete().eq("username", username);
      const { error } = await admin.from("players").delete().eq("username", username);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "setHidden") {
      const { username, hidden } = body;
      if (!username) return json({ error: "Missing player." }, 400);
      const { error } = await admin.from("players").update({ hidden: !!hidden }).eq("username", username);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "resetScore") {
      const { username } = body;
      if (!username) return json({ error: "Missing player." }, 400);
      // per-player: delete only this player's rows; opponents keep theirs
      const { error: d1 } = await admin.from("game_results").delete().eq("username", username);
      if (d1) throw d1;
      const { error: d2 } = await admin.from("players").update({ elo: 1000 }).eq("username", username);
      if (d2) throw d2;
      return json({ ok: true });
    }

    if (action === "renamePlayer") {
      const { oldName, newName } = body;
      if (!oldName || !newName) return json({ error: "Missing old or new name." }, 400);
      const trimmed = newName.trim();
      if (!trimmed) return json({ error: "Name cannot be blank." }, 400);
      if (trimmed === oldName) return json({ error: "Name is the same." }, 400);

      const { data: existing } = await admin.from("players").select("username").eq("username", trimmed).maybeSingle();
      if (existing) return json({ error: `"${trimmed}" already exists.` }, 400);

      const { error: e1 } = await admin.from("players").update({ username: trimmed }).eq("username", oldName);
      if (e1) throw e1;

      const { error: e2 } = await admin.from("game_results").update({ username: trimmed }).eq("username", oldName);
      if (e2) throw e2;

      const { error: e3 } = await admin.from("game_results").update({ winner: trimmed }).eq("winner", oldName);
      if (e3) throw e3;

      const { data: oppRows } = await admin.from("game_results").select("id, opponents").contains("opponents", JSON.stringify([oldName]));
      if (oppRows && oppRows.length > 0) {
        for (const row of oppRows) {
          const updated = (row.opponents || []).map((o) => (o === oldName ? trimmed : o));
          const { error: e4 } = await admin.from("game_results").update({ opponents: updated }).eq("id", row.id);
          if (e4) throw e4;
        }
      }

      const { data: matchRows } = await admin.from("matches").select("id, players, winner, per_player").contains("players", JSON.stringify([oldName]));
      if (matchRows && matchRows.length > 0) {
        for (const row of matchRows) {
          const upd = {};
          upd.players = (row.players || []).map((p) => (p === oldName ? trimmed : p));
          if (row.winner === oldName) upd.winner = trimmed;
          if (row.per_player && row.per_player[oldName] !== undefined) {
            const pp = { ...row.per_player };
            pp[trimmed] = pp[oldName];
            delete pp[oldName];
            upd.per_player = pp;
          }
          const { error: e5 } = await admin.from("matches").update(upd).eq("id", row.id);
          if (e5) throw e5;
        }
      }

      return json({ ok: true });
    }

    if (action === "rebuild") {
      return json({ error: "Rebuild has been disabled." }, 410);
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    return json({ error: err?.message || "Admin action failed." }, 500);
  }
}
