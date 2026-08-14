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

const WEDGES = [];
for (let i = 0; i < 20; i++) {
  const c = -90 + i * 18;
  const a0 = c - 9;
  const a1 = c + 9;
  const dark = i % 2 === 0;
  WEDGES.push({ key: `s${i}`, d: sector(16, 100, a0, a1), fill: dark ? "#20242a" : "#efe9d8" });
  WEDGES.push({ key: `d${i}`, d: sector(92, 100, a0, a1), fill: dark ? "#2c9a60" : "#e03a3a" });
  WEDGES.push({ key: `t${i}`, d: sector(54, 62, a0, a1), fill: dark ? "#2c9a60" : "#e03a3a" });
}

/**
 * Splash / loading screen: a slowly spinning dartboard with a dart that
 * flies in and sticks in the bull on a loop, plus the wordmark. Pure CSS
 * animation (see "loading screen" section of globals.css); honors
 * prefers-reduced-motion.
 */
export default function LoadingScreen({ text = "loading…" }) {
  return (
    <main className="app">
      <div className="load-wrap">
        <div className="load-stage" aria-hidden="true">
          <svg className="load-board" viewBox="-4 -4 208 208" width="170" height="170">
            <circle cx={100} cy={100} r={102} fill="#181a1f" />
            {WEDGES.map((w) => (
              <path key={w.key} d={w.d} fill={w.fill} />
            ))}
            <circle cx={100} cy={100} r={16} fill="#2c9a60" stroke="#181a1f" strokeWidth="1.5" />
            <circle cx={100} cy={100} r={7} fill="#e03a3a" stroke="#181a1f" strokeWidth="1.5" />
          </svg>

          <span className="load-ring" />

          <svg className="load-dart" viewBox="0 0 120 24" width="96" height="20">
            {/* flight */}
            <path d="M112 12 L120 3 L104 7 Z" fill="var(--accent)" />
            <path d="M112 12 L120 21 L104 17 Z" fill="var(--accent)" opacity="0.7" />
            {/* shaft + barrel */}
            <rect x="58" y="10.4" width="48" height="3.2" rx="1.6" fill="#8b94a1" />
            <rect x="34" y="9" width="26" height="6" rx="3" fill="#3a414b" />
            {/* point */}
            <path d="M34 12 L4 12 L34 10.6 Z" fill="#b8bec8" />
            <path d="M34 12 L4 12 L34 13.4 Z" fill="#9aa1ac" />
          </svg>
        </div>

        <div className="load-title">Blackbird</div>
        <div className="load-sub">dart scoring system</div>

        <div className="load-status" role="status">
          {text.replace(/…$/, "")}
          <span className="load-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </main>
  );
}
