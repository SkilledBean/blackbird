/**
 * Splash shown on every app open: the Blackbird wordmark with a loading
 * wheel below it. page.js keeps this up for 1–3 seconds per open (plus
 * however long auth/data actually take) so launching always has a moment
 * of perceived loading. Honors prefers-reduced-motion.
 */
export default function LoadingScreen({ text = "loading…" }) {
  return (
    <main className="app">
      <div className="load-wrap">
        <div className="load-title">Blackbird</div>
        <div className="load-sub">dart scoring system</div>
        <span className="load-spinner" aria-hidden="true" />
        <div className="load-status" role="status">
          {text}
        </div>
      </div>
    </main>
  );
}
