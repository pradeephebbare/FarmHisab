import { requireUser } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { ProjectForm } from "@/components/forms";
import { PageHeader } from "@/components/ui";

export default async function NewProject() {
  const { supabase, user } = await requireUser();
  const { t } = await getT();
  const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader title={t("proj.createTitle")} back={{ href: "/?all=1", label: t("common.back") }} />
      <div className="card"><ProjectForm defaultName={data?.full_name ?? ""} /></div>
    </main>
  );
}
