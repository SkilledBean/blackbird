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

/**
 * Splash shown on every app open: the Blackbird wordmark with a spinning
 * mini dartboard as the loading wheel — a flat 8-section board drawn in a
 * single color that follows the theme (dark ink on light, light ink on
 * dark). page.js keeps this up for 1–3 seconds per open (plus however
 * long auth/data actually take) so launching always has a moment of
 * perceived loading. Honors prefers-reduced-motion.
 */
export default function LoadingScreen({ text = "loading…" }) {
  return (
    <main className="app">
      <div className="load-wrap">
        <div className="load-title">Blackbird</div>
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
