// Single source of truth for the user-visible app version (shown bottom-right by
// layout.tsx). Bump on EVERY deploy, semver-style:
//   patch (0.0.x) — small fix / copy / prompt / KB-card tweak
//   minor (0.x.0) — notable feature or behavior change
//   major (x.0.0) — big release / milestone
export const APP_VERSION = "0.0.4";
