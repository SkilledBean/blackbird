/**
 * Experimental full-app skins for the admin "theme lab". A skin swaps the
 * design tokens and component geometry (colors, radii, fonts, nav/button
 * shapes) via a data-skin attribute on <html> — see the skins section at
 * the end of globals.css. Stored per-account in Supabase user_metadata
 * (key: "skin"), so picking one only changes the app for that login.
 */
export const SKINS = [
  { id: "default", label: "Blackbird", blurb: "The standard look." },
  { id: "anduril", label: "Anduril", blurb: "Defense-console: near-black, squared edges, monochrome." },
  { id: "airbnb", label: "Airbnb", blurb: "Warm and rounded: white, coral, pill buttons." },
  { id: "uber", label: "Uber", blurb: "Black-and-white utility: sharp, bold, high contrast." },
];

export function applySkin(skin) {
  if (typeof document === "undefined") return;
  const active = SKINS.some((s) => s.id === skin) && skin !== "default";
  if (active) document.documentElement.dataset.skin = skin;
  else delete document.documentElement.dataset.skin;
}
