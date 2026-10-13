import { loadLedger, loadProject } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { PaymentForm } from "@/components/forms";
import { PaymentReverse } from "@/components/actions-ui";

export default async function Payments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, members, activeMembers, me } = await loadProject(id);
  const ledger = await loadLedger(supabase, id);
  const { t, locale } = await getT();
  const name = (mid: string) => members.find((m) => m.id === mid)?.display_name ?? "";
  return (
    <>
      <PageHeader title={t("pay.title")} back={{ href: `/p/${id}/more`, label: t("nav.more") }} />
      <div className="space-y-4">
        {activeMembers.length < 2 ? <p className="card">{t("pay.needTwo")}</p> : !ledger.settlement && (
          <PaymentForm projectId={id} meMemberId={me.id} members={activeMembers.map((m) => ({ id: m.id, name: m.display_name }))} />
        )}
        {ledger.payments.length === 0 ? <p className="text-ink-soft">{t("pay.empty")}</p> : (
          <ul className="space-y-2">
            {ledger.payments.map((p) => (
              <li key={p.id} className={`card ${p.status === "reversed" ? "opacity-60" : ""}`}>
                <p className="font-semibold">{name(p.from_member)} → {name(p.to_member)}</p>
                <p className={`text-lg font-bold tabular-nums ${p.status === "reversed" ? "line-through" : ""}`}>{formatINR(Number(p.amount_paise))}</p>
                <p className="text-sm text-ink-soft">{formatDate(locale, p.paid_on)}{p.method ? ` · ${t(`pm.${p.method as "cash"}`)}` : ""}{p.status === "reversed" ? ` · ${t("st.reversed")}` : ""}</p>
                {p.status === "active" && !ledger.settlement && <div className="mt-2"><PaymentReverse projectId={id} paymentId={p.id} /></div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
