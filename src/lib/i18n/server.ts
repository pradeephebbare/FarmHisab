import { cookies, headers } from "next/headers";
import { LANG_COOKIE, isLocale, translate, type Locale, type TFn } from "./index";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLocale(c)) return c;
  const accept = (await headers()).get("accept-language") ?? "";
  return accept.toLowerCase().startsWith("kn") ? "kn" : "en";
}

export async function getT(): Promise<{ t: TFn; locale: Locale }> {
  const locale = await getLocale();
  return { locale, t: (key, params) => translate(locale, key, params) };
}
