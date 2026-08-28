import { useState, useEffect } from "react";

const PARTICLES = Array.from({ length: 36 }, (_, i) => ({
  left: ((i * 37 + 11) % 100),
  delay: ((i * 23 + 7) % 800) / 1000,
  dur: 0.8 + ((i * 13 + 5) % 600) / 1000,
  size: 5 + ((i * 17 + 3) % 8),
  color: ["var(--accent)", "#ffd24a", "#e03a3a", "#3b82f6", "#a855f7"][(i * 7 + 2) % 5],
  angle: (i * 10) % 360,
}));

export default function Celebration({ type, label, onDone }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDone && onDone();
    }, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div className="celeb-overlay">
      <div className="celeb-burst">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="celeb-particle"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              width: p.size,
              height: p.size,
              background: p.color,
              "--celeb-angle": `${p.angle}deg`,
            }}
          />
        ))}
      </div>
      <div className="celeb-text">
        <div className="celeb-big">{type === "180" ? "180!" : type === "shanghai" ? "SHANGHAI!" : type === "halved" ? "HALVED!" : type === "reset" ? "RESET!" : label || "Nice!"}</div>
        {label && type !== "halved" && type !== "reset" && <div className="celeb-sub">{label}</div>}
      </div>
    </div>
  );
}

export function checkX01Celebration(turnDarts, dartValue) {
  if (!turnDarts || turnDarts.length === 0) return null;
  const sum = turnDarts.reduce((a, d) => a + dartValue(d), 0);
  if (sum === 180) return { type: "180" };
  return null;
}

export function checkCheckoutCelebration(checkout) {
  if (checkout >= 100) return { type: "checkout", label: `Checkout ${checkout}!` };
  if (checkout >= 40) return { type: "checkout", label: `${checkout} checkout` };
  return null;
}

export function checkCricketCloseCelebration() {
  return { type: "close", label: "All closed!" };
}
