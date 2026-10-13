import Link from "next/link";
import { ChevronRight, Scale, Wallet, Home as HomeIcon } from "lucide-react";
import { loadLedger, loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { LangSwitch } from "@/components/LangSwitch";
import { PageHeader } from "@/components/ui";
import { MemberRemove, MoreControls, SignOutButton } from "@/components/actions-ui";

export default async function More({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, project, members, me } = await loadProject(id);
  const ledger = await loadLedger(supabase, id);
  const { t } = await getT();
  const link = (href: string, label: string, Icon: typeof Scale) => (
    <Link href={href} className="card flex min-h-touch items-center gap-3 font-semibold"><Icon aria-hidden className="h-6 w-6 text-field-700" />{label}<ChevronRight aria-hidden className="ml-auto h-5 w-5" /></Link>
  );
  return (
    <>
      <PageHeader title={t("more.title")} />
      <div className="space-y-5">
        <section className="card"><p className="mb-2 font-bold">{t("more.language")}</p><LangSwitch className="flex-wrap" /></section>
        <div className="space-y-2">
          {link(`/p/${id}/terms`, t("more.terms"), Scale)}
          {link(`/p/${id}/payments`, t("more.payments"), Wallet)}
          {link("/?all=1", t("nav.projects"), HomeIcon)}
        </div>
        <section>
          <h2 className="mb-2 text-lg font-bold">{t("more.members")}</h2>
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.id} className={`card ${m.status === "removed" ? "opacity-60" : ""}`}>
                <p className="font-semibold">{m.display_name}{m.id === me.id ? ` (${t("common.you")})` : ""}</p>
                <p className="text-sm text-ink-soft">{t(`role.${m.role}`)}{m.is_admin ? ` · ${t("more.admin")}` : ""}{m.status === "removed" ? ` · ${t("more.removed")}` : ""}</p>
                {m.status === "active" && !ledger.settlement && (m.id === me.id || me.is_admin) && <MemberRemove projectId={id} memberId={m.id} name={m.display_name} self={m.id === me.id} />}
              </li>
            ))}
          </ul>
        </section>
        <MoreControls projectId={id} policy={project.approval_policy} status={project.status} isAdmin={me.is_admin} locked={ledger.settlement !== null} />
        <SignOutButton />
      </div>
    </>
  );
}
