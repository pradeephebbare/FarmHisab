import { loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { IncomeForm } from "@/components/IncomeForm";
import { PageHeader } from "@/components/ui";

export default async function NewIncome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { activeMembers, me } = await loadProject(id);
  const { t } = await getT();
  return (
    <>
      <PageHeader title={t("inc.add")} back={{ href: `/p/${id}/income`, label: t("common.back") }} />
      <IncomeForm projectId={id} meMemberId={me.id} members={activeMembers.map((m) => ({ id: m.id, name: m.display_name }))} />
    </>
  );
}
