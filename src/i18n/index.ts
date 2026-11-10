import en from "./locales/en";
import fr from "./locales/fr";
import es from "./locales/es";
import de from "./locales/de";
import it from "./locales/it";
import pt from "./locales/pt";

/**
 * Translations of the interface.
 *
 * To add a language: create `locales/<code>.ts` (copy `en.ts`, typed with
 * `satisfies Messages`) and register it in `LOCALES`.
 * To add a text: add the key to `en.ts`, TypeScript then lists the locales
 * that miss it.
 */

/** Same shape as the reference locale, with any string as value. */
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type Messages = DeepStrings<typeof en>;

/** Dotted paths to the messages: "main.play", "skins.blue"... */
type Paths<T> = {
	[K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];
export type MessageKey = Paths<Messages>;

const LOCALES = { en, fr, es, de, it, pt } satisfies Record<string, Messages>;
export type Locale = keyof typeof LOCALES;
const FALLBACK: Locale = "en";

/**
 * First language of the device that we support ("fr-CA" → "fr").
 * `?lang=xx` in the URL forces a language (handy for testing).
 * `navigator.language` comes first: it is what the DevTools locale
 * override changes, while `navigator.languages` keeps the browser settings.
 */
function detectLocale(): Locale {
	const wanted = [
		new URLSearchParams(location.search).get("lang"),
		navigator.language,
		...(navigator.languages ?? []),
	];
	for (const tag of wanted) {
		const code = tag?.toLowerCase().split("-")[0];
		if (code && code in LOCALES) return code as Locale;
	}
	return FALLBACK;
}

export const locale: Locale = detectLocale();
document.documentElement.lang = locale;

function lookup(messages: Messages, key: string): string | undefined {
	let node: unknown = messages;
	for (const part of key.split(".")) {
		if (typeof node !== "object" || node === null) return undefined;
		node = (node as Record<string, unknown>)[part];
	}
	return typeof node === "string" ? node : undefined;
}

/**
 * Translated message for `key`, with `{param}` placeholders replaced.
 * Falls back to English, then to the key itself.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string;
/** Dynamic key (e.g. built from data): unknown keys return the key. */
export function t(key: string, params?: Record<string, string | number>): string;
export function t(key: string, params?: Record<string, string | number>): string {
	const text = lookup(LOCALES[locale], key) ?? lookup(LOCALES[FALLBACK], key) ?? key;
	if (!params) return text;
	return text.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match);
}
