const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

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

/**
 * Reference dartboard.
 *  highlight: array of numbers (1-20, or 25 for bull) to emphasize as the current target.
 *  hits:      array of darts thrown this turn: { n, mult }. n=0 is a miss (not drawn).
 */
export default function DartBoard({ highlight = [], hits = [], size = 220 }) {
  const wedges = [];
  for (let i = 0; i < 20; i++) {
    const c = -90 + i * 18;
    const a0 = c - 9;
    const a1 = c + 9;
    const dark = i % 2 === 0;
    wedges.push(<path key={`s${i}`} d={sector(16, 100, a0, a1)} fill={dark ? "#20242a" : "#efe9d8"} />);
    wedges.push(<path key={`d${i}`} d={sector(92, 100, a0, a1)} fill={dark ? "#2c9a60" : "#e03a3a"} />);
    wedges.push(<path key={`t${i}`} d={sector(54, 62, a0, a1)} fill={dark ? "#2c9a60" : "#e03a3a"} />);
  }

  // open sectors get a faint tint + crisp outline (a heavy fill reads as
  // a solid mask when several adjacent numbers are open, e.g. cricket)
  const hi = [];
  highlight.forEach((n, idx) => {
    if (n === 25) {
      hi.push(
        <circle
          key={`hi${idx}`}
          cx={100}
          cy={100}
          r={19}
          fill="var(--accent)"
          fillOpacity="0.12"
          stroke="var(--accent)"
          strokeWidth="2.5"
        />
      );
      return;
    }
    const i = ORDER.indexOf(n);
    if (i < 0) return;
    const c = -90 + i * 18;
    hi.push(
      <path
        key={`hi${idx}`}
        d={sector(16, 100, c - 9, c + 9)}
        fill="var(--accent)"
        fillOpacity="0.12"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    );
  });

  const labels = ORDER.map((n, i) => {
    const c = -90 + i * 18;
    const [x, y] = pt(112, c);
    const open = highlight.includes(n);
    return (
      <text
        key={`l${n}`}
        x={x}
        y={y}
        fontSize="11"
        fontWeight={open ? "800" : "700"}
        textAnchor="middle"
        dominantBaseline="central"
        fill={open ? "var(--accent)" : "var(--ink)"}
      >
        {n}
      </text>
    );
  });

  const marks = hits
    .filter((h) => h && h.n > 0)
    .map((h, idx) => {
      let r;
      let deg;
      if (h.n === 25) {
        r = h.mult === 2 ? 0 : 11;
        deg = -90;
      } else {
        const i = ORDER.indexOf(h.n);
        deg = -90 + (i < 0 ? 0 : i) * 18;
        r = h.mult === 2 ? 96 : h.mult === 3 ? 58 : 78;
      }
      const [x, y] = pt(r, deg);
      return <circle key={`m${idx}`} cx={x} cy={y} r={5.5} fill="#ffd24a" stroke="#16181d" strokeWidth="1.6" />;
    });

  return (
    <svg
      viewBox="-24 -24 248 248"
      width={size}
      height={size}
      style={{ display: "block", margin: "0 auto", maxWidth: "100%" }}
      aria-hidden="true"
    >
      <circle cx={100} cy={100} r={101} fill="#000" opacity="0.15" />
      {wedges}
      {hi}
      <circle cx={100} cy={100} r={16} fill="#2c9a60" />
      <circle cx={100} cy={100} r={7} fill="#e03a3a" />
      {marks}
      {labels}
    </svg>
  );
}
