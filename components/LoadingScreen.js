import { useState, useEffect } from "react";
import { getOccasion } from "@/lib/occasions";

function pt(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
}

function sector(rI, rO, a0, a1) {
  const [x0, y0] = pt(rO, a0);
  const [x1, y1] = pt(rO, a1);
  const [x2, y2] = pt(rI, a1);
  const [x3, y3] = pt(rI, a0);
  return `M${x0} ${y0} A${rO} ${rO} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${rI} ${rI} 0 0 0 ${x3} ${y3} Z`;
}

// simple 8-section board: every other 45° wedge filled, single color
const WEDGES = [];
for (let i = 0; i < 8; i++) {
  if (i % 2 === 0) continue;
  const c = -90 + i * 45;
  WEDGES.push(sector(20, 84, c - 22.5, c + 22.5));
}

// deterministic particle fields (no randomness → stable and reproducible)
const CONFETTI = Array.from({ length: 44 }, (_, i) => ({
  left: (i * 97) % 100,
  delay: ((i * 53) % 100) / 40, // 0–2.5s
  dur: 2.6 + ((i * 31) % 100) / 50, // 2.6–4.6s
  size: 6 + ((i * 13) % 3) * 2,
  color: ["var(--accent)", "#e0962b", "#e03a3a", "#3b82f6", "#d70466"][i % 5],
}));

const SNOW = Array.from({ length: 54 }, (_, i) => ({
  left: (i * 61) % 100,
  delay: ((i * 37) % 120) / 20, // 0–6s
  dur: 6 + ((i * 29) % 100) / 20, // 6–11s
  size: 3 + ((i * 17) % 4), // 3–6px
  op: 0.45 + ((i * 23) % 50) / 100,
}));

/** Tiny flat-vector party hat, perched on the wordmark on Sep 11. */
function PartyHat() {
  return (
    <svg className="load-hat" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 5 L31 34 L9 34 Z" fill="var(--accent)" />
      <circle cx="20" cy="5" r="3.6" fill="var(--amber)" />
    </svg>
  );
}

/**
 * Splash shown on every app open: the Blackbird wordmark with a spinning
 * mini dartboard as the loading wheel — a flat 8-section board drawn in a
 * single color that follows the theme (dark ink on light, light ink on
 * dark). page.js keeps this up for 1–3 seconds per open (plus however
 * long auth/data actually take) so launching always has a moment of
 * perceived loading. Honors prefers-reduced-motion.
 *
 * Seasonal flourishes (lib/occasions.js): confetti + a party hat on
 * Sep 11, falling snow through December. Rendered only after mount so
 * server-prerendered HTML stays date-independent.
 */
export default function LoadingScreen({ text = "loading…" }) {
  const [occasion, setOccasion] = useState(null);
  useEffect(() => {
    setOccasion(getOccasion());
  }, []);

  return (
    <main className="app">
      {occasion === "birthday" && (
        <div className="load-fx" aria-hidden="true">
          {CONFETTI.map((p, i) => (
            <span
              key={i}
              className="load-confetti"
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.size * 0.55,
                background: p.color,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>
      )}
      {occasion === "snow" && (
        <div className="load-fx" aria-hidden="true">
          {SNOW.map((f, i) => (
            <span
              key={i}
              className="load-flake"
              style={{
                left: `${f.left}%`,
                width: f.size,
                height: f.size,
                opacity: f.op,
                animationDuration: `${f.dur}s`,
                animationDelay: `${f.delay}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="load-wrap">
        <div className="load-title">
          {occasion === "birthday" && <PartyHat />}
          Blackbird
        </div>
        <div className="load-sub">dart scoring system</div>
        <svg className="load-spinner" viewBox="-4 -4 208 208" aria-hidden="true">
          <circle cx={100} cy={100} r={96} fill="none" stroke="currentColor" strokeWidth="8" />
          {WEDGES.map((d, i) => (
            <path key={i} d={d} fill="currentColor" />
          ))}
          <circle cx={100} cy={100} r={11} fill="currentColor" />
        </svg>
        <div className="load-status" role="status">
          {text}
        </div>
      </div>
    </main>
  );
}
