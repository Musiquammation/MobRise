// Deployment environment, loaded before the game by index.html.
// gh-pages version of public/env.js: the game lives under /MobRise/.
// The version is updated by scripts/gh-pages.sh at each deploy.
window.MOBRISE_ENV = { base: "/MobRise/", version: "?" };
console.log("MobRise " + window.MOBRISE_ENV.version);
