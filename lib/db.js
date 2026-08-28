import { supabase } from "./supabase";
import { BASE_ELO } from "./constants";

/**
 * Data access layer for the shared `players` and `game_results` tables.
 * Per-player scoring: each game writes one row per participant, and each
 * player's current Elo is stored on their players row.
 */

export async function getPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("username, created_at, hidden, elo, color")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((r) => ({
    username: r.username,
    createdAt: r.created_at,
    hidden: !!r.hidden,
    elo: r.elo == null ? BASE_ELO : Number(r.elo),
    color: r.color || null,
  }));
}

export async function addPlayer(username, hidden = false) {
  const { error } = await supabase.from("players").insert({ username, hidden, elo: BASE_ELO });
  if (error) {
    if (error.code === "23505") return false; // duplicate username
    throw error;
  }
  return true;
}

export async function setPlayerHidden(username, hidden) {
  const { error } = await supabase.from("players").update({ hidden }).eq("username", username);
  if (error) throw error;
}

export async function setPlayerColor(username, color) {
  const { error } = await supabase.from("players").update({ color }).eq("username", username);
  if (error) throw error;
}

export async function getGameResults() {
  const { data, error } = await supabase
    .from("game_results")
    .select("*")
    .order("completed_at", { ascending: true });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    gameId: r.game_id,
    username: r.username,
    gameType: r.game_type,
    config: r.config || {},
    winner: r.winner,
    result: r.result,
    opponents: r.opponents || [],
    stats: r.stats || {},
    eloAfter: r.elo_after == null ? BASE_ELO : Number(r.elo_after),
    completedAt: r.completed_at,
  }));
}

/**
 * Record one finished game: insert a result row for each player and write
 * back their new Elo. `eloAfter` is a map { username: newRating }.
 */
export async function recordGame({ gameId, gameType, config, players, winner, perPlayer, eloAfter, completedAt }) {
  const rows = players.map((u) => ({
    game_id: gameId,
    username: u,
    game_type: gameType,
    config: config || {},
    winner,
    result: u === winner ? "win" : "loss",
    opponents: players.filter((p) => p !== u),
    stats: (perPlayer && perPlayer[u]) || {},
    elo_after: Math.round(eloAfter[u]),
    completed_at: completedAt,
  }));

  const { error: insErr } = await supabase.from("game_results").insert(rows);
  if (insErr) throw insErr;

  for (const u of players) {
    const { error: updErr } = await supabase
      .from("players")
      .update({ elo: Math.round(eloAfter[u]) })
      .eq("username", u);
    if (updErr) throw updErr;
  }
}
