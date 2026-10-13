import { notFound } from "next/navigation";
import { loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { ExpenseForm } from "@/components/ExpenseForm";
import { PageHeader } from "@/components/ui";

export default async function NewExpense({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { me } = await loadProject(id);
  if (me.role !== "landowner") notFound();
  const { t } = await getT();
  return (
    <>
      <PageHeader title={t("exp.add")} back={{ href: `/p/${id}/expenses`, label: t("common.back") }} />
      <ExpenseForm projectId={id} meMemberId={me.id} mode="new" />
    </>
  );
}
