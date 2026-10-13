import { Wheat } from "lucide-react";
import type { ReactNode } from "react";
import { LangSwitch } from "./LangSwitch";
import { getT } from "@/lib/i18n/server";

export async function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = await getT();
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-6">
      <LangSwitch className="mb-6 flex-wrap" />
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-field-700 text-white"><Wheat aria-hidden className="h-8 w-8" /></span>
        <div>
          <p className="text-2xl font-bold">FarmHisab</p>
          <p className="text-sm text-ink-soft">{t("app.tagline")}</p>
        </div>
      </div>
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <div className="card">{children}</div>
      <p className="mt-4 text-sm text-ink-soft">{t("app.promise")}</p>
    </main>
  );
}
