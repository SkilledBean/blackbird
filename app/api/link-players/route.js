import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (!url || !anon || !serviceKey) return json({ linked: 0 });

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return json({ error: "Not signed in." }, 401);

  const caller = createClient(url, anon);
  const { data: who, error: whoErr } = await caller.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: "Session invalid." }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (!authUsers?.users) return json({ linked: 0 });

  const res = await admin
    .from("players")
    .select("username, auth_id")
    .is("auth_id", null);
  if (res.error) return json({ linked: 0 });

  const unlinked = res.data || [];
  if (unlinked.length === 0) return json({ linked: 0 });

  const usersByName = {};
  for (const u of authUsers.users) {
    const dn = (u.user_metadata?.display_name || "").toLowerCase();
    if (dn) usersByName[dn] = u.id;
  }

  const alreadyLinked = new Set();
  const resAll = await admin.from("players").select("auth_id").not("auth_id", "is", null);
  if (resAll.data) {
    for (const r of resAll.data) alreadyLinked.add(r.auth_id);
  }

  let linked = 0;
  for (const p of unlinked) {
    const matchId = usersByName[(p.username || "").toLowerCase()];
    if (matchId && !alreadyLinked.has(matchId)) {
      await admin.from("players").update({ auth_id: matchId }).eq("username", p.username);
      alreadyLinked.add(matchId);
      linked++;
    }
  }

  return json({ linked });
}
