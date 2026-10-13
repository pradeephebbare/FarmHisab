import { notFound } from "next/navigation";
import { loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/i18n";
import { Notice, PageHeader, Row, StatusBadge } from "@/components/ui";
import { ExpenseActions, RemoveAttachmentButton } from "@/components/actions-ui";
import { AddPhoto } from "@/components/AddPhoto";
import type { AttachmentRow, ExpenseRow, HistoryRow } from "@/lib/types";

export default async function ExpenseDetail({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params;
  const { supabase, members, me, user, activeMembers } = await loadProject(id);
  const { t, locale } = await getT();
  const { data: e } = await supabase.from("expenses").select("*").eq("id", eid).eq("project_id", id).maybeSingle<ExpenseRow>();
  if (!e) notFound();
  const [{ data: hist }, { data: atts }, { data: locks }] = await Promise.all([
    supabase.from("expense_status_history").select("*").eq("expense_id", eid).order("created_at").returns<HistoryRow[]>(),
    supabase.from("attachments").select("*").eq("entity_type", "expense").eq("entity_id", eid).is("removed_at", null).returns<AttachmentRow[]>(),
    supabase.from("settlements").select("id").eq("project_id", id).in("status", ["pending_confirmation", "final"]).limit(1),
  ]);
  const attachments = atts ?? [];
  const signed = attachments.length
    ? (await supabase.storage.from("receipts").createSignedUrls(attachments.map((a) => a.storage_path), 300)).data ?? []
    : [];
  const urlFor = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? null;
  const person = (uid: string) => members.find((m) => m.user_id === uid)?.display_name ?? "";
  const canMe = e.created_by === user.id || me.is_admin || e.paid_by === me.id;
  const only = activeMembers.length === 1;
  const canReview = e.created_by !== user.id || only;
  const locked = (locks ?? []).length > 0;

  return (
    <>
      <PageHeader title={t("exp.detail")} back={{ href: `/p/${id}/expenses`, label: t("exp.title") }} right={<StatusBadge status={e.status} t={t} />} />
      <div className="space-y-4">
        {e.status === "disputed" && <Notice tone="warn">{t("exp.disputeWarn")}</Notice>}
        {e.status === "reversed" && <Notice tone="info">{t("exp.reversedNote", { reason: e.reversal_reason ?? "" })}</Notice>}
        <div className="khata">
          <p className={`text-4xl font-bold tabular-nums ${e.status === "reversed" ? "line-through" : ""}`}>{formatINR(Number(e.amount_paise))}</p>
          <div className="mt-3">
            <Row label={t("exp.category")} value={t(`cat.${e.category}`)} />
            <Row label={t("exp.for")} value={t(e.expense_for === "farmer" ? "role.farmer" : "role.landowner")} />
            <Row label={t("exp.date")} value={formatDate(locale, e.expense_date)} />
            {e.payment_method && <Row label={t("exp.method")} value={t(`pm.${e.payment_method as "cash"}`)} />}
          </div>
          {e.description && <p className="mt-2 font-semibold">{e.description}</p>}
          {e.notes && <p className="text-ink-soft">{e.notes}</p>}
          <p className="mt-2 text-sm text-ink-soft">{t("exp.enteredBy", { name: person(e.created_by) })}</p>
        </div>
        {e.created_by === user.id && !only && e.status === "awaiting_review" && <p className="hint">{t("exp.ownExpense")}</p>}

        <ExpenseActions projectId={id} expenseId={eid} status={e.status} canReview={canReview} canReverse={e.created_by === user.id || me.is_admin} canAmend={canMe} locked={locked} editHref={`/p/${id}/expenses/${eid}/edit`} />

        <section>
          <h2 className="mb-2 text-lg font-bold">{t("exp.attachments")}</h2>
          {attachments.length === 0 ? <p className="text-ink-soft">{t("exp.noAttachments")}</p> : (
            <ul className="space-y-3">
              {attachments.map((a) => {
                const u = urlFor(a.storage_path);
                return (
                  <li key={a.id} className="card space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {u && <a href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={t("exp.receipt")} className="max-h-72 w-full rounded-lg object-contain" /></a>}
                    {(a.uploaded_by === user.id || me.is_admin) && e.status !== "reversed" && <RemoveAttachmentButton projectId={id} attachmentId={a.id} />}
                  </li>
                );
              })}
            </ul>
          )}
          {e.status !== "reversed" && <div className="mt-3"><AddPhoto projectId={id} entity="expense" entityId={eid} /></div>}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">{t("exp.history")}</h2>
          <ol className="space-y-2">
            {(hist ?? []).map((h) => (
              <li key={h.id} className="card py-3">
                <p className="font-semibold">{t(`st.${h.to_status as "confirmed"}`)} · <span className="font-normal">{t("common.by", { name: person(h.actor) })}</span></p>
                <p className="text-sm text-ink-soft">{formatDate(locale, h.created_at)}</p>
                {h.note && <p className="mt-1">{h.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
