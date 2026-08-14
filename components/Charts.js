/**
 * Tiny dependency-free SVG line chart. Scales to container width via viewBox.
 * data: [{ x:number, y:number, date?:string }]
 */
export function LineChart({ data, color = "var(--accent)", unit = "", decimals = 0 }) {
  if (!data || data.length === 0) {
    return (
      <p className="tag" style={{ textTransform: "none", letterSpacing: 0, margin: "6px 0" }}>
        Not enough games yet.
      </p>
    );
  }

  const W = 600;
  const H = 230;
  const padL = 46;
  const padR = 16;
  const padT = 16;
  const padB = 30;

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const padY = (maxY - minY) * 0.15;
  minY -= padY;
  maxY += padY;
  if (unit === "%") {
    minY = Math.max(0, minY);
    maxY = Math.min(100, maxY);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spanX = maxX - minX || 1;

  const sx = (x) => padL + ((x - minX) / spanX) * (W - padL - padR);
  const sy = (y) => padT + (1 - (y - minY) / (maxY - minY)) * (H - padT - padB);

  const fmt = (v) => {
    const f = Math.pow(10, decimals);
    return Math.round(v * f) / f;
  };

  const ticks = [maxY, (minY + maxY) / 2, minY];
  const points = data.map((d) => `${sx(d.x)},${sy(d.y)}`).join(" ");
  const areaPath =
    `M ${sx(data[0].x)},${sy(data[0].y)} ` +
    data.slice(1).map((d) => `L ${sx(d.x)},${sy(d.y)}`).join(" ") +
    ` L ${sx(data[data.length - 1].x)},${H - padB} L ${sx(data[0].x)},${H - padB} Z`;

  const fmtDate = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const gradId = `g-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={W - padR}
            y1={sy(t)}
            y2={sy(t)}
            stroke="var(--line)"
            strokeWidth="1"
          />
          <text x={padL - 8} y={sy(t) + 4} textAnchor="end" fontSize="13" fill="var(--ink-soft)">
            {fmt(t)}
            {unit}
          </text>
        </g>
      ))}

      {data.length > 1 && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}

      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {data.map((d, i) => (
        <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r={data.length > 24 ? 0 : 3} fill={color} />
      ))}

      <text x={padL} y={H - 8} textAnchor="start" fontSize="12" fill="var(--ink-soft)">
        {fmtDate(data[0].date)}
      </text>
      {data.length > 1 && (
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize="12" fill="var(--ink-soft)">
          {fmtDate(data[data.length - 1].date)}
        </text>
      )}
    </svg>
  );
}

/**
 * Matching dependency-free SVG bar chart. Same frame/axis style as
 * LineChart. data: [{ x:number, y:number, date?:string }] — one bar per
 * point (used on Home for games per week over the last 3 months).
 */
export function BarChart({ data, color = "var(--accent)" }) {
  if (!data || data.length === 0 || !data.some((d) => d.y > 0)) {
    return (
      <p className="tag" style={{ textTransform: "none", letterSpacing: 0, margin: "6px 0" }}>
        No games in this period yet.
      </p>
    );
  }

  const W = 600;
  const H = 200;
  const padL = 40;
  const padR = 12;
  const padT = 14;
  const padB = 28;

  const maxY = Math.max(1, ...data.map((d) => d.y));
  const sy = (v) => padT + (1 - v / maxY) * (H - padT - padB);
  const slot = (W - padL - padR) / data.length;
  const bw = Math.min(slot * 0.62, 34);

  const mid = Math.round(maxY / 2);
  const ticks = mid > 0 && mid < maxY ? [maxY, mid, 0] : [maxY, 0];

  const fmtDate = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: "block" }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={padL - 8} y={sy(t) + 4} textAnchor="end" fontSize="13" fill="var(--ink-soft)">
            {t}
          </text>
        </g>
      ))}

      {data.map((d, i) => {
        const x = padL + i * slot + (slot - bw) / 2;
        const y = sy(d.y);
        const h = Math.max(0, H - padB - y);
        if (h === 0) return null;
        return <rect key={i} x={x} y={y} width={bw} height={h} rx="3" fill={color} />;
      })}

      <text x={padL} y={H - 8} textAnchor="start" fontSize="12" fill="var(--ink-soft)">
        {fmtDate(data[0].date)}
      </text>
      {data.length > 1 && (
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize="12" fill="var(--ink-soft)">
          {fmtDate(data[data.length - 1].date)}
        </text>
      )}
    </svg>
  );
}
