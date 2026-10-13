import { notFound } from "next/navigation";
import { loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { paiseToRupeesString } from "@/lib/money";
import { ExpenseForm } from "@/components/ExpenseForm";
import { PageHeader } from "@/components/ui";
import type { ExpenseRow } from "@/lib/types";

export default async function EditExpense({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params;
  const { supabase, me } = await loadProject(id);
  const { t } = await getT();
  const { data: e } = await supabase.from("expenses").select("*").eq("id", eid).eq("project_id", id).maybeSingle<ExpenseRow>();
  if (!e || e.status === "reversed") notFound();
  return (
    <>
      <PageHeader title={t("exp.amendTitle")} back={{ href: `/p/${id}/expenses/${eid}`, label: t("common.back") }} />
      <ExpenseForm
        projectId={id} meMemberId={me.id} mode="edit" expenseId={eid}
        initial={{ amount: paiseToRupeesString(Number(e.amount_paise)), category: e.category, expenseFor: e.expense_for, paidBy: e.paid_by, date: e.expense_date, description: e.description ?? "", method: e.payment_method ?? "", notes: e.notes ?? "" }}
      />
    </>
  );
}
