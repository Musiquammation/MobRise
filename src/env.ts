/** Deployment environment, set by public/env.js (which differs on gh-pages). */
declare global {
	interface Window {
		MOBRISE_ENV?: { base?: string; version?: string; debug?: boolean };
	}
}

/** URL prefix of the site, always ending with "/" ("/" locally and in the apps, "/MobRise/" on gh-pages). */
export const BASE = (window.MOBRISE_ENV?.base ?? "/").replace(/\/?$/, "/");

/** Absolute URL of a file of public/, e.g. url("models/player.gltf"). */
export function url(path: string): string {
	return BASE + path.replace(/^\//, "");
}

/** false when env.js turns the debug overlays off (gh-pages), whatever config.ts says. */
export const DEBUG_ALLOWED = window.MOBRISE_ENV?.debug !== false;
