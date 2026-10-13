import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Clock, RotateCcw, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { TFn } from "@/lib/i18n";
import type { ExpenseStatus } from "@/lib/settlement";

export function PageHeader({ title, back, right }: { title: string; back?: { href: string; label: string }; right?: ReactNode }) {
  return (
    <header className="mb-4">
      {back && (
        <Link href={back.href} className="mb-1 inline-flex min-h-touch items-center gap-1 font-semibold text-field-800">
          <ArrowLeft aria-hidden className="h-5 w-5" />
          {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold leading-snug">{title}</h1>
        {right}
      </div>
    </header>
  );
}

const STATUS_STYLE: Record<ExpenseStatus, { cls: string; Icon: typeof Check }> = {
  awaiting_review: { cls: "bg-sky-50 text-sky-700 border-sky-700", Icon: Clock },
  confirmed: { cls: "bg-field-50 text-field-800 border-field-700", Icon: Check },
  disputed: { cls: "bg-chili-50 text-chili-700 border-chili-700", Icon: AlertTriangle },
  resolved: { cls: "bg-field-50 text-field-800 border-field-700", Icon: ShieldCheck },
  reversed: { cls: "bg-gray-100 text-ink-soft border-gray-400", Icon: RotateCcw },
};
/** Status is shown with an icon AND text, never colour alone. */
export function StatusBadge({ status, t }: { status: ExpenseStatus; t: TFn }) {
  const { cls, Icon } = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${cls}`}>
      <Icon aria-hidden className="h-4 w-4" />
      {t(`st.${status}`)}
    </span>
  );
}

export function Notice({ tone, children }: { tone: "warn" | "info" | "ok"; children: ReactNode }) {
  const cls = tone === "warn" ? "border-chili-700 bg-chili-50" : tone === "ok" ? "border-field-700 bg-field-50" : "border-sky-700 bg-sky-50";
  const Icon = tone === "warn" ? AlertTriangle : tone === "ok" ? Check : Clock;
  return (
    <div role={tone === "warn" ? "alert" : "status"} className={`flex gap-3 rounded-xl border-2 p-3 ${cls}`}>
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Row({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: "neg" | "pos" }) {
  return (
    <div className="leader py-1">
      <span className={strong ? "font-bold" : ""}>{label}</span>
      <span className="dots" aria-hidden />
      <span className={`whitespace-nowrap tabular-nums ${strong ? "text-lg font-bold" : "font-semibold"} ${tone === "neg" ? "text-chili-700" : ""}`}>{value}</span>
    </div>
  );
}
