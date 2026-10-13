import Link from "next/link";
import { Plus } from "lucide-react";
import { loadLedger, loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { computeTotals } from "@/lib/settlement";
import { formatDate } from "@/lib/i18n";
import { Notice, PageHeader, Row } from "@/components/ui";
import { IncomeActions } from "@/components/actions-ui";

export default async function Income({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, members, activeMembers, me, user } = await loadProject(id);
  const ledger = await loadLedger(supabase, id);
  const { t, locale } = await getT();
  const totals = computeTotals({
    expenses: [],
    incomes: ledger.incomes.map((i) => ({ id: i.id, kind: i.kind, amountPaise: Number(i.amount_paise), paymentStatus: i.payment_status, receivedBy: i.received_by, status: i.status })),
  });
  const name = (mid: string | null) => members.find((m) => m.id === mid)?.display_name ?? "";
  const locked = ledger.settlement !== null;
  return (
    <>
      <PageHeader title={t("inc.title")} />
      <Link href={`/p/${id}/income/new`} className="btn btn-primary mb-4 w-full text-lg"><Plus aria-hidden className="h-6 w-6" />{t("inc.add")}</Link>
      <section className="khata mb-4">
        <Row label={t("inc.cropSales")} value={formatINR(totals.cropSalesRecordedPaise)} />
        <Row label={t("inc.otherIncome")} value={formatINR(totals.otherIncomeRecordedPaise)} />
        <Row label={t("inc.totalReceived")} value={formatINR(totals.receivedIncomePaise)} strong />
        <Row label={t("inc.totalPending")} value={formatINR(totals.pendingIncomePaise)} />
      </section>
      {totals.pendingIncomePaise !== 0 && <div className="mb-4"><Notice tone="info">{t("inc.pendingExplain")}</Notice></div>}
      {ledger.incomes.length === 0 ? <p className="card text-ink-soft">{t("inc.empty")}</p> : (
        <ul className="space-y-2">
          {ledger.incomes.map((i) => (
            <li key={i.id} className={`card ${i.status === "reversed" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{t(`inc.kind.${i.kind}`)}{i.buyer ? ` · ${i.buyer}` : ""}</p>
                  <p className="text-sm text-ink-soft">{formatDate(locale, i.income_date)}{i.quantity ? ` · ${i.quantity} ${i.quantity_unit ? t(`qu.${i.quantity_unit as "kg"}`) : ""}` : ""}</p>
                  {i.received_by && <p className="text-sm text-ink-soft">{t("inc.receivedBy")} {name(i.received_by)}</p>}
                  {i.notes && <p className="text-sm">{i.notes}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-bold tabular-nums ${i.status === "reversed" ? "line-through" : ""}`}>{formatINR(Number(i.amount_paise))}</p>
                  <p className="text-sm font-semibold">{i.status === "reversed" ? t("st.reversed") : i.payment_status === "received" ? t("inc.received") : t("inc.pending")}</p>
                </div>
              </div>
              {i.status === "reversed" && <p className="mt-2 text-sm">{t("inc.reversedNote", { reason: i.reversal_reason ?? "" })}</p>}
              {i.status === "active" && (
                <IncomeActions projectId={id} incomeId={i.id} pending={i.payment_status === "pending"} canReverse={i.created_by === user.id || me.is_admin}
                  members={activeMembers.map((m) => ({ id: m.id, name: m.display_name }))} meMemberId={me.id} locked={locked} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
