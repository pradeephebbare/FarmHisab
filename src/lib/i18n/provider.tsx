"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translate, type Locale, type TFn } from "./index";

const Ctx = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

export function useT(): TFn {
  const locale = useLocale();
  return useMemo<TFn>(() => (key, params) => translate(locale, key, params), [locale]);
}
