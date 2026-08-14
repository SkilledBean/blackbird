import { useState } from "react";

/**
 * Logo: shows your own image from /public/logo.png if present.
 * If there's no logo file, it shows nothing (keeps the spot's spacing) —
 * no dartboard fallback.
 */
export function Logo({ size = 36 }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span style={{ width: size, height: size, display: "inline-block", flex: "none" }} aria-hidden="true" />;
  }
  return (
    <img
      src="/logo.png"
      alt="Blackbird"
      onError={() => setFailed(true)}
      style={{ height: size, width: size, objectFit: "contain", borderRadius: 8, display: "block", flex: "none" }}
    />
  );
}

export function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="num">{value}</div>
      <div className="tag" style={{ marginTop: 3 }}>
        {label}
      </div>
    </div>
  );
}

export function Mini({ label, value }) {
  return (
    <div className="mini">
      <div className="num">{value}</div>
      <div className="tag" style={{ marginTop: 2, fontSize: "calc(10px * var(--fs-chrome))" }}>
        {label}
      </div>
    </div>
  );
}

/**
 * Gear icon for the settings button. Sized in em so it tracks the button's
 * font size, and therefore the user's text-size setting.
 */
export function GearIcon({ size = "1.2em" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** Flat single-color cast-to-TV icon (screen + signal arcs). */
export function CastIcon({ size = "1.1em" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
    >
      <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
      <path d="M2 12a9 9 0 0 1 8 8" />
      <path d="M2 16a5 5 0 0 1 4 4" />
      <line x1="2" y1="20" x2="2.01" y2="20" />
    </svg>
  );
}

export function BackBar({ back, title }) {
  return (
    <div className="row" style={{ alignItems: "center", marginBottom: 16 }}>
      <button
        className="btn"
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, padding: 0, flex: "none" }}
        onClick={back}
        aria-label="Back"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div className="display" style={{ fontSize: "calc(19px * var(--fs))" }}>
        {title}
      </div>
    </div>
  );
}

export function Modal({ children }) {
  return (
    <div className="modal-backdrop">
      <div className="modal fade">{children}</div>
    </div>
  );
}
