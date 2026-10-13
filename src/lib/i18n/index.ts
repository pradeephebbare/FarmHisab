import { en, type Key } from "./en";
import { kn } from "./kn";

export type Locale = "en" | "kn";
export const LOCALES: Locale[] = ["en", "kn"];
export const LANG_COOKIE = "fh_lang";
export type { Key };

export const dictionaries: Record<Locale, Record<Key, string>> = { en, kn };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "kn";
}

export function translate(locale: Locale, key: Key, params?: Record<string, string | number>): string {
  let s = dictionaries[locale][key];
  if (s === undefined) {
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing ${locale} translation: ${key}`);
    s = en[key] ?? key;
  }
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export type TFn = (key: Key, params?: Record<string, string | number>) => string;

export function formatDate(locale: Locale, iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return new Intl.DateTimeFormat(locale === "kn" ? "kn-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" }).format(d);
}
