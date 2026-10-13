import Link from "next/link";
import { buildSettlementInput, loadLedger, loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { computeSettlement, TermsError, type Basis } from "@/lib/settlement";
import { formatDate } from "@/lib/i18n";
import { Notice, PageHeader } from "@/components/ui";
import { SettlementReport } from "@/components/SettlementReport";
import { BasisToggle, SettlementActions } from "@/components/actions-ui";

export default async function SettlementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ basis?: string }> }) {
  const { id } = await params;
  const { basis: b } = await searchParams;
  const { supabase, project, members, activeMembers, user } = await loadProject(id);
  const ledger = await loadLedger(supabase, id);
  const { t, locale } = await getT();
  const basis: Basis = b === "recorded" ? "recorded" : "received";
  const s = ledger.settlement;
  const confirmedNames = activeMembers.filter((m) => ledger.confirmations.includes(m.user_id)).map((m) => m.display_name);
  const waitingNames = activeMembers.filter((m) => !ledger.confirmations.includes(m.user_id)).map((m) => m.display_name);

  if (s) {
    return (
      <>
        <PageHeader title={t("set.title")} />
        <div className="space-y-4">
          <Notice tone={s.status === "final" ? "ok" : "info"}>
            <p className="font-bold">{s.status === "final" ? t("set.final") : t("set.pendingConfirm")}</p>
            <p>{t("set.version", { n: s.version })} · {t("set.agreementUsed", { n: s.snapshot.agreementVersion })} · {t("set.createdOn", { date: formatDate(locale, s.created_at) })}</p>
            {confirmedNames.length > 0 && <p>{t("set.confirmedBy", { names: confirmedNames.join(", ") })}</p>}
            {s.status === "pending_confirmation" && waitingNames.length > 0 && <p>{t("set.waitingFor", { names: waitingNames.join(", ") })}</p>}
          </Notice>
          <SettlementReport r={s.snapshot.result} t={t} />
          <SettlementActions projectId={id} mode={s.status === "final" ? "final" : "pending"} basis={s.basis} blocked={false} settlementId={s.id} iConfirmed={ledger.confirmations.includes(user.id)} canAmend />
        </div>
      </>
    );
  }

  const input = buildSettlementInput(project, members, ledger, basis);
  let result = null;
  let termsProblem = false;
  if (input) {
    try { result = computeSettlement(input); } catch (e) { if (e instanceof TermsError) termsProblem = true; else throw e; }
  }
  return (
    <>
      <PageHeader title={t("set.title")} />
      <div className="space-y-4">
        {(!input || termsProblem) && (
          <div className="card space-y-3">
            <p>{t("set.needTerms")}</p>
            <Link href={`/p/${id}/terms`} className="btn btn-green w-full">{t("set.goTerms")}</Link>
          </div>
        )}
        {result && (
          <>
            <BasisToggle projectId={id} basis={basis} />
            <p className="text-sm font-semibold text-sky-700">{t("set.preview")}</p>
            <SettlementReport r={result} t={t} />
            <SettlementActions projectId={id} mode="preview" basis={basis} blocked={result.provisional || !result.reconciles} />
          </>
        )}
      </div>
    </>
  );
}
