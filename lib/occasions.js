/**
 * Date-triggered flourishes for the loading screen.
 *  - "birthday": September 11 — confetti + a party hat on the wordmark
 *  - "snow":     all of December — falling snow
 * Preview any of them on a normal day with ?occasion=birthday or
 * ?occasion=snow in the URL.
 */
export function getOccasion(now = new Date()) {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("occasion");
    if (q === "birthday" || q === "snow") return q;
  }
  const month = now.getMonth(); // 0-based
  const day = now.getDate();
  if (month === 8 && day === 11) return "birthday"; // Sep 11
  if (month === 11) return "snow"; // December
  return null;
}
