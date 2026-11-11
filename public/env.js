// Deployment environment, loaded before the game by index.html.
// This is the only file that differs between master and gh-pages:
// on gh-pages the game lives under /MobRise/, logs its version and has no debug overlays.
window.MOBRISE_ENV = { base: "/" };
