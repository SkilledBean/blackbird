import { createClient } from "@supabase/supabase-js";

// Runs on the server only. The AI key lives in a non-public env var and is
// never sent to the browser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash", // free tier
  groq: "llama-3.3-70b-versatile", // free tier
  openai: "gpt-4o-mini", // paid
  anthropic: "claude-3-5-haiku-latest", // paid
};

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildPrompt(kind, summary, question) {
  const system =
    "You are a sharp darts analyst for a small friendly league. " +
    "Use ONLY the JSON data provided; never invent stats or names. " +
    "The data may include aggregate player stats AND individual game results " +
    "(with per-game stats like highestTurn, checkout, runs, mpr, dartsThrown, dates, opponents). " +
    "When answering questions about specific games, records, or events, reference " +
    "the individual game results and their dates. " +
    "Write plain prose (no markdown headers or bullet symbols), specific and " +
    "citing the real numbers. Be as thorough as the question needs: a few sentences " +
    "for simple asks, and a full, well-organized answer (up to ~500 words) for " +
    "complex or multi-part questions. Finish your thought — do not stop mid-sentence. " +
    "When mentioning dates or times, always format them in a natural, readable way " +
    "like 'Tuesday, October 9th, 2026 at 10:00 PM'. Never output raw ISO timestamps " +
    "or date strings like '2026-10-09T22:00:00.000Z'.";

  let task;
  if (kind === "custom") {
    const q = (question || "").toString().slice(0, 600).trim();
    task =
      `Answer this question about the league, using ONLY the data below. ` +
      `If the data can't answer it, say so plainly rather than guessing.\n\nQUESTION: ${q}`;
  } else if (kind === "player") {
    task =
      "Profile this player: strengths, weaknesses, current form, and one concrete thing to work on.";
  } else if (kind === "matchup") {
    task =
      "Preview this head-to-head: who is favoured and why, the key stat that decides it, and one X-factor.";
  } else {
    task =
      "Give a league overview: who is hot, the biggest surprise, the tightest rivalry, and a fun award or two.";
  }

  return { system, user: `${task}\n\nDATA:\n${JSON.stringify(summary)}` };
}

async function callAI({ system, user }) {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  const model = process.env.AI_MODEL || DEFAULT_MODELS[provider];

  if (provider === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.8,
            // gemini-2.5 spends output tokens on internal "thinking", which can
            // truncate the visible answer; turn it off so all tokens go to text
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || "Gemini request failed");
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter((p) => p && p.text && !p.thought)
      .map((p) => p.text)
      .join("");
    return { text, model: `gemini/${model}` };
  }

  if (provider === "groq" || provider === "openai") {
    const key = provider === "groq" ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
    if (!key) throw new Error(`${provider.toUpperCase()}_API_KEY is not set`);
    const base =
      provider === "groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions";
    const r = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.8,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `${provider} request failed`);
    return { text: data?.choices?.[0]?.message?.content || "", model: `${provider}/${model}` };
  }

  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || "Anthropic request failed");
    const text = (data?.content || []).map((b) => b.text || "").join("");
    return { text, model: `anthropic/${model}` };
  }

  throw new Error(`Unknown AI_PROVIDER: ${provider}`);
}

export async function POST(req) {
  // --- auth: require a valid Supabase session token ---
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const sUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !sUrl || !sKey) return jsonRes({ error: "Unauthorized" }, 401);
  const sb = createClient(sUrl, sKey);
  const { data: userData, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !userData?.user) return jsonRes({ error: "Unauthorized" }, 401);

  // --- generate ---
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "Bad request" }, 400);
  }
  const { kind, summary, question } = body || {};
  if (!summary) return jsonRes({ error: "Missing data" }, 400);
  if (kind === "custom" && !(question || "").toString().trim()) {
    return jsonRes({ error: "Type a question first." }, 400);
  }

  try {
    const { system, user } = buildPrompt(kind, summary, question);
    const { text, model } = await callAI({ system, user });
    if (!text.trim()) return jsonRes({ error: "The model returned an empty response." }, 502);
    return jsonRes({ text, model });
  } catch (e) {
    return jsonRes({ error: e.message || "AI request failed" }, 500);
  }
}
