"use client";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLanguage } from "@/app/actions";
import { useLocale } from "@/lib/i18n/provider";
import { useT } from "@/lib/i18n/provider";

export function LangSwitch({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div className={`flex items-center gap-2 ${className}`} role="group" aria-label={t("common.language")}>
      <Globe aria-hidden className="h-5 w-5 text-field-700" />
      {(["kn", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          aria-pressed={locale === l}
          onClick={() => start(() => setLanguage(l))}
          className={`min-h-touch min-w-touch rounded-xl border-2 px-4 font-semibold ${locale === l ? "border-field-700 bg-field-700 text-white" : "border-field-200 bg-white text-field-800"}`}
        >
          {l === "kn" ? "ಕನ್ನಡ" : "English"}
        </button>
      ))}
    </div>
  );
}
