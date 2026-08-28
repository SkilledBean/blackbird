import { useState } from "react";
import { PlayerBadge } from "./ui";
import { defaultPlayerColor } from "@/lib/constants";

const FONT = '"Figtree", Arial, sans-serif';

function isLight(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function themePalette() {
  const root = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const accent = (root && root.getPropertyValue("--accent").trim()) || "#0e8c5a";
  const theme = (typeof document !== "undefined" && document.documentElement.dataset.theme) || "light";

  if (theme === "glass") {
    return {
      theme,
      accent,
      bg: "#080c18",
      ink: "#f5f8fc",
      inkSoft: "rgba(245,248,252,0.62)",
      tile: "rgba(255,255,255,0.10)",
      tileBorder: "rgba(255,255,255,0.22)",
      frame: "rgba(255,255,255,0.22)",
    };
  }
  if (theme === "dark") {
    return {
      theme,
      accent,
      bg: "#0f1216",
      ink: "#eef1f5",
      inkSoft: "rgba(238,241,245,0.58)",
      tile: "rgba(255,255,255,0.05)",
      tileBorder: "rgba(255,255,255,0.11)",
      frame: "rgba(255,255,255,0.12)",
    };
  }
  return {
    theme: "light",
    accent,
    bg: "#f4f3ee",
    ink: "#181a1f",
    inkSoft: "rgba(24,26,31,0.55)",
    tile: "rgba(24,26,31,0.045)",
    tileBorder: "rgba(24,26,31,0.10)",
    frame: "rgba(24,26,31,0.12)",
  };
}

async function ensureFont() {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('800 80px "Figtree"'),
      document.fonts.load('700 40px "Figtree"'),
      document.fonts.load('600 30px "Figtree"'),
    ]);
    await document.fonts.ready;
  } catch {
    /* fall back to Arial */
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitFont(ctx, text, maxWidth, startSize, weight) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && size > 28) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

function paintBackground(ctx, W, H, pal) {
  if (pal.theme === "glass") {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    const blob = (x, y, r, color, alpha) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    };
    blob(W * 0.12, H * 0.08, 560, "#7877ff", 0.5);
    blob(W * 0.9, H * 0.12, 600, "#14c896", 0.42);
    blob(W * 0.74, H * 0.95, 660, "#f45eaf", 0.38);
    blob(W * 0.08, H * 0.9, 600, "#46beff", 0.4);
    return;
  }
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.82, 110, 60, W * 0.82, 110, 720);
  glow.addColorStop(0, pal.accent);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = pal.theme === "light" ? 0.1 : 0.16;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

function drawCard(user, stats, elo, playerColor) {
  const W = 1080;
  const H = 1350;
  const pal = themePalette();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  paintBackground(ctx, W, H, pal);

  // rounded frame
  ctx.strokeStyle = pal.frame;
  ctx.lineWidth = 2;
  roundRect(ctx, 40, 40, W - 80, H - 80, 52);
  ctx.stroke();

  const cx = W / 2;
  ctx.textAlign = "center";

  // header
  ctx.fillStyle = pal.accent;
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText("BLACKBIRD", cx, 130);
  ctx.fillStyle = pal.inkSoft;
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText("DART SCORING", cx, 168);

  // player avatar circle
  const avatarColor = playerColor || defaultPlayerColor(user);
  const avatarR = 56;
  const avatarCY = 250;
  ctx.beginPath();
  ctx.arc(cx, avatarCY, avatarR, 0, Math.PI * 2);
  ctx.fillStyle = avatarColor;
  ctx.fill();
  ctx.fillStyle = isLight(avatarColor) ? "#333" : "#fff";
  ctx.font = `700 54px ${FONT}`;
  ctx.fillText(user.charAt(0).toUpperCase(), cx, avatarCY + 18);

  // player name
  ctx.fillStyle = pal.ink;
  const nameSize = fitFont(ctx, user, W - 220, 90, "800");
  ctx.font = `800 ${nameSize}px ${FONT}`;
  ctx.fillText(user, cx, 370);

  // ELO
  ctx.fillStyle = pal.accent;
  ctx.font = `800 140px ${FONT}`;
  ctx.fillText(String(Math.round(elo || 1000)), cx, 530);
  ctx.fillStyle = pal.inkSoft;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText("ELO RATING", cx, 575);

  // record
  const wins = stats.wins;
  const losses = stats.games - stats.wins;
  ctx.fillStyle = pal.ink;
  ctx.font = `700 38px ${FONT}`;
  ctx.fillText(`${wins}-${losses}  ·  ${stats.games} games  ·  ${stats.winPct.toFixed(0)}% win`, cx, 650);

  // tiles
  const tiles = [
    ["3-DART AVG", stats.x01.threeDartAvg ? stats.x01.threeDartAvg.toFixed(1) : "—"],
    ["BEST LEG", stats.x01.bestLeg ? `${stats.x01.bestLeg}` : "—"],
    ["HIGH OUT", stats.x01.highestCheckout || "—"],
    ["HIGH TURN", stats.x01.highestTurn || "—"],
    ["CRICKET MPR", stats.cricket.mpr ? stats.cricket.mpr.toFixed(2) : "—"],
    ["AVG RUNS", stats.baseball.avgRuns ? stats.baseball.avgRuns.toFixed(1) : "—"],
  ];
  const cols = 2;
  const gap = 28;
  const tileW = (W - 160 - gap) / cols;
  const tileH = 150;
  const startX = 80;
  const startY = 720;
  tiles.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (tileW + gap);
    const y = startY + row * (tileH + gap);
    ctx.fillStyle = pal.tile;
    roundRect(ctx, x, y, tileW, tileH, 30);
    ctx.fill();
    ctx.strokeStyle = pal.tileBorder;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, tileW, tileH, 30);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = pal.inkSoft;
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(t[0], x + 28, y + 48);
    ctx.fillStyle = pal.ink;
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(String(t[1]), x + 28, y + 112);
  });

  // footer
  ctx.textAlign = "center";
  ctx.fillStyle = pal.inkSoft;
  ctx.font = `600 26px ${FONT}`;
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  ctx.fillText(date, cx, H - 58);

  return canvas;
}

export default function PlayerCard({ user, stats, elo, onOpenAccount, playerColors }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const exportCard = async () => {
    setBusy(true);
    setNote("");
    try {
      await ensureFont();
      const color = playerColors?.[user] || defaultPlayerColor(user);
      const canvas = drawCard(user, stats, elo, color);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Could not create image.");
      const file = new File([blob], `${user}-blackbird.png`, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `${user} — Blackbird`, text: `${user}'s darts card` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setNote("Card saved to downloads.");
      }
    } catch (e) {
      if (e && e.name === "AbortError") {
        /* user cancelled the share sheet */
      } else {
        setNote(e.message || "Couldn't export the card.");
      }
    } finally {
      setBusy(false);
    }
  };

  const wins = stats.wins;
  const losses = stats.games - stats.wins;

  return (
    <div className="card mb-12" style={{ overflow: "hidden", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(60% 50% at 90% 0%, var(--accent-soft), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="num" style={{ fontSize: "calc(36px * var(--fs))", color: "var(--accent)" }}>{Math.round(elo || 1000)}</span>
          <span className="tag">Elo</span>
        </div>

        <div className="row mt-12" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-primary" style={{ flex: 1, minWidth: 150 }} onClick={exportCard} disabled={busy}>
            {busy ? "Preparing…" : "Export Player Card"}
          </button>
          {onOpenAccount && (
            <button className="btn" style={{ flex: 1, minWidth: 120 }} onClick={onOpenAccount}>
              Settings
            </button>
          )}
        </div>
        {note && (
          <p className="tag" style={{ textTransform: "none", letterSpacing: 0, marginTop: 10 }}>{note}</p>
        )}
      </div>
    </div>
  );
}
