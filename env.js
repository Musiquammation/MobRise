// Deployment environment, loaded before the game by index.html.
// gh-pages version of public/env.js: the game lives under /MobRise/, no debug overlays.
// The version is updated by scripts/gh-pages.sh at each deploy.
window.MOBRISE_ENV = { base: "/MobRise/", version: "0.1.0 (89c520e, 2026-11-11)", debug: false };
console.log("MobRise " + window.MOBRISE_ENV.version);
