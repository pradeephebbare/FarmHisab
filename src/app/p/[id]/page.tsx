import Link from "next/link";
import { Plus } from "lucide-react";
import { loadLedger, loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { computeTotals } from "@/lib/settlement";
import { formatDate } from "@/lib/i18n";
import { Notice, StatusBadge } from "@/components/ui";

export default async function Dashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, project, me, members, user } = await loadProject(id);
  const ledger = await loadLedger(supabase, id);
  const { t, locale } = await getT();
  const totals = computeTotals({
    expenses: ledger.expenses.map((e) => ({ id: e.id, paidBy: e.paid_by, amountPaise: Number(e.amount_paise), status: e.status })),
    incomes: ledger.incomes.map((i) => ({ id: i.id, kind: i.kind, amountPaise: Number(i.amount_paise), paymentStatus: i.payment_status, receivedBy: i.received_by, status: i.status })),
  });
  const live = ledger.expenses.filter((e) => e.status !== "reversed");
  const landownerExpenses = live.filter((e) => e.expense_for === "landowner").reduce((a, e) => a + Number(e.amount_paise), 0);
  const farmerExpenses = live.filter((e) => e.expense_for === "farmer").reduce((a, e) => a + Number(e.amount_paise), 0);
  const toReview = live.filter((e) => e.status === "awaiting_review" && e.created_by !== user.id).length;
  const disputed = live.filter((e) => e.status === "disputed").length;
  const hasIncome = ledger.incomes.some((i) => i.status === "active");
  const net = totals.receivedIncomePaise - totals.totalExpensesPaise;
  const name = (mid: string) => members.find((m) => m.id === mid)?.display_name ?? "";
  const settleLabel = ledger.settlement ? (ledger.settlement.status === "final" ? t("dash.settlementFinal") : t("dash.settlementPending")) : t("dash.settlementNone");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold leading-snug">{project.name}</h1>
        <p className="text-ink-soft">{project.crop_name} · {project.season} · {t(`ps.${project.status}`)}</p>
      </header>

      {me.role === "landowner" && <Link href={`/p/${id}/expenses/new`} className="btn btn-primary w-full min-h-[64px] text-xl"><Plus aria-hidden className="h-7 w-7" />{t("exp.add")}</Link>}

      {toReview > 0 && <Link href={`/p/${id}/expenses`} className="block"><Notice tone="info">{t("dash.reviewAlert", { n: toReview })}</Notice></Link>}
      {disputed > 0 && <Link href={`/p/${id}/expenses`} className="block"><Notice tone="warn">{t("dash.disputeAlert", { n: disputed })}</Notice></Link>}

      {live.length === 0 && !hasIncome ? (
        <div className="card text-center">
          <p className="text-xl font-bold">{t("dash.emptyTitle")}</p>
          <p className="text-ink-soft">{t("dash.emptyBody")}</p>
        </div>
      ) : (
        <>
          <section className="khata" aria-label={t("dash.totalExpenses")}>
            <p className="font-semibold">{t("dash.totalExpenses")}</p>
            <p className="text-4xl font-bold tabular-nums">{formatINR(totals.totalExpensesPaise)}</p>
            <div className="mt-3 space-y-1">
              <div className="leader"><span>{t("dash.landownerExpenses")}</span><span className="dots" aria-hidden /><span className="font-bold tabular-nums">{formatINR(landownerExpenses)}</span></div>
              <div className="leader"><span>{t("dash.farmerExpenses")}</span><span className="dots" aria-hidden /><span className="font-bold tabular-nums">{formatINR(farmerExpenses)}</span></div>
            </div>
          </section>
          <section className="card">
            <p className="font-semibold">{t("dash.cropIncome")}</p>
            <p className="text-3xl font-bold tabular-nums">{formatINR(totals.receivedIncomePaise)}</p>
            <p className="text-sm text-ink-soft">{t("dash.incomeReceived")}</p>
            {totals.pendingIncomePaise > 0 && <p className="mt-1 font-semibold">{t("dash.incomePending", { amount: formatINR(totals.pendingIncomePaise) })}</p>}
          </section>
          <section className="card">
            <p className="font-semibold">{net < 0 ? t("dash.netLoss") : t("dash.netProfit")}</p>
            {hasIncome ? (
              <p className={`text-3xl font-bold tabular-nums ${net < 0 ? "text-chili-700" : ""}`}>{formatINR(net)}</p>
            ) : (
              <p className="text-ink-soft">{t("dash.netAfterIncome")}</p>
            )}
          </section>
        </>
      )}

      <Link href={`/p/${id}/settlement`} className="card flex min-h-touch items-center justify-between gap-3">
        <span className="font-semibold">{t("dash.settlementLabel")}</span>
        <span className="text-ink-soft">{settleLabel}</span>
      </Link>

      {live.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">{t("dash.recent")}</h2>
            <Link href={`/p/${id}/expenses`} className="inline-flex min-h-touch items-center font-semibold text-field-800 underline">{t("dash.seeAll")}</Link>
          </div>
          <ul className="space-y-2">
            {live.slice(0, 4).map((e) => (
              <li key={e.id}>
                <Link href={`/p/${id}/expenses/${e.id}`} className="card flex items-center justify-between gap-3">
                  <span><span className="block font-semibold">{t(`cat.${e.category}`)}</span><span className="block text-sm text-ink-soft">{t(e.expense_for === "farmer" ? "role.farmer" : "role.landowner")} · {formatDate(locale, e.expense_date)}</span></span>
                  <span className="text-right"><span className="block font-bold tabular-nums">{formatINR(Number(e.amount_paise))}</span><StatusBadge status={e.status} t={t} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
