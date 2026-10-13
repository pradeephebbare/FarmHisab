import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Receipt, Users, Scale } from "lucide-react";
import { requireUser } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n";
import { LangSwitch } from "@/components/LangSwitch";
import { SignOutButton } from "@/components/actions-ui";
import type { Project } from "@/lib/types";

export default async function Home({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const { supabase } = await requireUser();
  const { t, locale } = await getT();
  const { data } = await supabase.from("projects").select("*").order("last_activity_at", { ascending: false }).returns<Project[]>();
  const projects = data ?? [];
  if (projects.length === 1 && !all) redirect(`/p/${projects[0]!.id}`);
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6">
      <LangSwitch className="mb-6 flex-wrap" />
      <h1 className="mb-4 text-2xl font-bold">{t("proj.myFarms")}</h1>
      {projects.length === 0 ? (
        <div className="space-y-4">
          <div className="card">
            <p className="text-xl font-bold">{t("proj.emptyTitle")}</p>
            <p className="mb-4">{t("proj.emptyBody")}</p>
            <ol className="space-y-3">
              {([["onb.s1", Receipt], ["onb.s2", Users], ["onb.s3", Scale]] as const).map(([k, Icon]) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-field-100 text-field-800"><Icon aria-hidden className="h-6 w-6" /></span>
                  <span className="font-semibold">{t(k)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/p/${p.id}`} className="card block min-h-touch hover:bg-field-50">
                <span className="block text-lg font-bold">{p.name}</span>
                <span className="block text-ink-soft">{p.crop_name} · {p.season}{p.village ? ` · ${p.village}` : ""}</span>
                <span className="mt-1 block text-sm text-ink-soft">{t(`ps.${p.status}`)} · {t("proj.lastActivity", { date: formatDate(locale, p.last_activity_at) })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/projects/new" className="btn btn-primary mt-5 w-full text-lg"><Plus aria-hidden className="h-6 w-6" />{t("proj.create")}</Link>
      <div className="mt-6"><SignOutButton /></div>
    </main>
  );
}
