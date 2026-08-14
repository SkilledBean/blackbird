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

// flat mini dartboard: 20 alternating wedges + double/triple rings + bull
const WEDGES = [];
for (let i = 0; i < 20; i++) {
  const c = -90 + i * 18;
  const a0 = c - 9;
  const a1 = c + 9;
  const dark = i % 2 === 0;
  WEDGES.push({ key: `s${i}`, d: sector(16, 100, a0, a1), fill: dark ? "#20242a" : "#efe9d8" });
  WEDGES.push({ key: `d${i}`, d: sector(84, 100, a0, a1), fill: dark ? "#2c9a60" : "#e03a3a" });
  WEDGES.push({ key: `t${i}`, d: sector(50, 62, a0, a1), fill: dark ? "#2c9a60" : "#e03a3a" });
}

/**
 * Splash shown on every app open: the Blackbird wordmark with a spinning
 * mini dartboard as the loading wheel. page.js keeps this up for 1–3
 * seconds per open (plus however long auth/data actually take) so
 * launching always has a moment of perceived loading. Honors
 * prefers-reduced-motion.
 */
export default function LoadingScreen({ text = "loading…" }) {
  return (
    <main className="app">
      <div className="load-wrap">
        <div className="load-title">Blackbird</div>
        <div className="load-sub">dart scoring system</div>
        <svg className="load-spinner" viewBox="-3 -3 206 206" aria-hidden="true">
          <circle cx={100} cy={100} r={102} fill="#181a1f" />
          {WEDGES.map((w) => (
            <path key={w.key} d={w.d} fill={w.fill} />
          ))}
          <circle cx={100} cy={100} r={17} fill="#2c9a60" />
          <circle cx={100} cy={100} r={8} fill="#e03a3a" />
        </svg>
        <div className="load-status" role="status">
          {text}
        </div>
      </div>
    </main>
  );
}
