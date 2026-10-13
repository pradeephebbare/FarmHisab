import Link from "next/link";
import { Plus } from "lucide-react";
import { loadLedger, loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/i18n";
import { PageHeader, StatusBadge } from "@/components/ui";

export default async function Expenses({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await loadProject(id);
  const { expenses } = await loadLedger(supabase, id);
  const { t, locale } = await getT();
  const landownerTotal = expenses.filter((e) => e.status !== "reversed" && e.expense_for === "landowner").reduce((sum, e) => sum + Number(e.amount_paise), 0);
  const farmerTotal = expenses.filter((e) => e.status !== "reversed" && e.expense_for === "farmer").reduce((sum, e) => sum + Number(e.amount_paise), 0);
  return (
    <>
      <PageHeader title={t("exp.title")} />
      {me.role === "landowner" && <Link href={`/p/${id}/expenses/new`} className="btn btn-primary mb-4 w-full text-lg"><Plus aria-hidden className="h-6 w-6" />{t("exp.add")}</Link>}
      <section className="khata mb-4" aria-label={t("exp.title")}>
        <div className="leader"><span>{t("dash.landownerExpenses")}</span><span className="dots" aria-hidden /><span className="font-bold tabular-nums">{formatINR(landownerTotal)}</span></div>
        <div className="leader"><span>{t("dash.farmerExpenses")}</span><span className="dots" aria-hidden /><span className="font-bold tabular-nums">{formatINR(farmerTotal)}</span></div>
      </section>
      {expenses.length === 0 ? <p className="card text-ink-soft">{t("exp.empty")}</p> : (
        <ul className="space-y-2">
          {expenses.map((e) => (
            <li key={e.id}>
              <Link href={`/p/${id}/expenses/${e.id}`} className={`card flex items-center justify-between gap-3 ${e.status === "reversed" ? "opacity-60" : ""}`}>
                <span>
                  <span className="block font-semibold">{t(`cat.${e.category}`)}</span>
                  <span className="block text-sm text-ink-soft">{t(e.expense_for === "farmer" ? "role.farmer" : "role.landowner")} · {formatDate(locale, e.expense_date)}</span>
                  {e.description && <span className="block text-sm">{e.description}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block font-bold tabular-nums ${e.status === "reversed" ? "line-through" : ""}`}>{formatINR(Number(e.amount_paise))}</span>
                  <StatusBadge status={e.status} t={t} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
