"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bug, Check, Droplets, Ellipsis, FlaskConical, Shovel, Sprout, Tractor, Truck, Users, Wheat } from "lucide-react";
import { addExpense, amendExpense } from "@/app/actions";
import { parseRupeesToPaise } from "@/lib/money";
import { CATEGORIES, PAYMENT_METHODS, type Category } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";
import type { Key } from "@/lib/i18n";
import { clearDraft, draftKey, localToday, readDraft, useOnlineHook, writeDraft } from "./draft";
import { ReceiptPicker } from "./ReceiptPicker";
import { uploadAttachment } from "./upload";

const ICONS: Record<Category, typeof Sprout> = {
  seeds: Sprout, fertilizers: FlaskConical, pesticides: Bug, labour: Users, machinery: Tractor,
  irrigation: Droplets, transport: Truck, land_preparation: Shovel, harvesting: Wheat, other: Ellipsis,
};

const schema = z.object({
  amount: z.string().refine((v) => { const p = parseRupeesToPaise(v); return p !== null && p > 0; }, "err.FH_INVALID_AMOUNT"),
  category: z.enum(CATEGORIES, { errorMap: () => ({ message: "common.required" }) }),
  expenseFor: z.enum(["landowner", "farmer"]),
  paidBy: z.string().uuid("common.required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "err.FH_INVALID_DATE"),
  description: z.string().max(200),
  method: z.string(),
  notes: z.string().max(500),
  reason: z.string(),
});
type Values = z.infer<typeof schema>;

interface Props {
  projectId: string;
  meMemberId: string;
  mode: "new" | "edit";
  expenseId?: string;
  initial?: Partial<Values>;
}

export function ExpenseForm({ projectId, meMemberId, mode, expenseId, initial }: Props) {
  const t = useT();
  const router = useRouter();
  const online = useOnlineHook();
  const key = draftKey(projectId, "expense");
  const clientId = useRef<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<Key | null>(null);
  const [restored, setRestored] = useState(false);
  const [saved, setSaved] = useState<{ expenseId: string; uploadFailed: Key | null } | null>(null);
  const [showMore, setShowMore] = useState(Boolean(initial?.method || initial?.notes));

  const defaults = useMemo<Values>(() => ({
    amount: "", category: "other" as Category, expenseFor: "landowner", paidBy: meMemberId, date: "", description: "", method: "", notes: "", reason: "", ...initial,
  }), [meMemberId, initial]);
  const { register, handleSubmit, control, watch, reset, setValue, setError, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    clientId.current = crypto.randomUUID();
    if (mode === "new") {
      const d = readDraft<{ values: Values; clientId: string }>(key);
      if (d?.values) {
        reset({ ...defaults, ...d.values, date: d.values.date || localToday() });
        if (d.clientId) clientId.current = d.clientId;   // same key => safe retry without duplicates
        setRestored(true);
        return;
      }
    }
    if (!initial?.date) setValue("date", localToday());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "new") return;
    const sub = watch((v) => {
      const empty = !v.amount && !v.description && !v.notes;
      if (empty) { clearDraft(key); return; }
      writeDraft(key, { values: { ...v, reason: "" }, clientId: clientId.current });
    });
    return () => sub.unsubscribe();
  }, [watch, key, mode]);

  async function onSubmit(v: Values) {
    setFormError(null);
    if (!online) return setFormError("common.networkError");
    const payload = { projectId, clientId: clientId.current || crypto.randomUUID(), amount: v.amount, category: v.category, expenseFor: v.expenseFor, paidBy: v.paidBy, date: v.date, description: v.description, method: v.method as "", notes: v.notes };
    try {
      if (mode === "edit" && expenseId) {
        if (v.reason.trim().length < 3) return setError("reason", { message: "err.FH_REASON_REQUIRED" });
        const r = await amendExpense(expenseId, payload, v.reason);
        if (!r.ok) { if (r.fieldErrors?.amount) setError("amount", { message: r.fieldErrors.amount }); return setFormError(r.errorKey); }
        router.push(`/p/${projectId}/expenses/${expenseId}`);
        router.refresh();
        return;
      }
      const r = await addExpense(payload);
      if (!r.ok) { if (r.fieldErrors?.amount) setError("amount", { message: r.fieldErrors.amount }); return setFormError(r.errorKey); }
      clearDraft(key);
      let uploadFailed: Key | null = null;
      if (file) {
        const up = await uploadAttachment(projectId, "expense", r.expenseId, file);
        if (!up.ok) uploadFailed = up.errorKey;
      }
      setSaved({ expenseId: r.expenseId, uploadFailed });
      router.refresh();
    } catch {
      setFormError("common.networkError");
    }
  }

  async function retryUpload() {
    if (!file || !saved) return;
    const up = await uploadAttachment(projectId, "expense", saved.expenseId, file);
    setSaved({ ...saved, uploadFailed: up.ok ? null : up.errorKey });
  }

  if (saved) {
    return (
      <div className="space-y-4" role="status">
        <div className="card text-center">
          <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-field-700 text-white"><Check aria-hidden className="h-8 w-8" /></span>
          <p className="text-xl font-bold">{t("exp.savedTitle")}</p>
          <p>{t("exp.saved")}</p>
        </div>
        {saved.uploadFailed && (
          <div role="alert" className="rounded-xl border-2 border-chili-700 bg-chili-50 p-3">
            <p className="font-semibold">{t("exp.uploadFailed")}</p>
            <button type="button" className="btn btn-quiet mt-2 w-full" onClick={retryUpload}>{t("exp.retryUpload")}</button>
          </div>
        )}
        <button type="button" className="btn btn-primary w-full" onClick={() => { setSaved(null); setFile(null); clientId.current = crypto.randomUUID(); reset({ ...defaults, date: localToday() }); }}>{t("exp.addAnother")}</button>
        <Link href={`/p/${projectId}/expenses`} className="btn btn-quiet w-full">{t("exp.title")}</Link>
      </div>
    );
  }

  const err = (k: keyof Values) => (errors[k]?.message ? <p role="alert" id={`${k}-err`} className="field-error">{t(errors[k]?.message as Key)}</p> : null);
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {restored && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-xl border-2 border-sky-700 bg-sky-50 p-3">
          <span>{t("common.draftRestored")}</span>
          <button type="button" className="btn btn-quiet px-3 py-2" onClick={() => { clearDraft(key); reset({ ...defaults, date: localToday() }); setRestored(false); }}>{t("common.discardDraft")}</button>
        </div>
      )}
      <div>
        <label htmlFor="amount" className="label">{t("exp.amount")}</label>
        <div className="flex items-center gap-2 rounded-xl border-2 border-field-200 bg-white px-4 focus-within:border-field-700">
          <span aria-hidden className="text-3xl font-bold text-field-700">₹</span>
          <input id="amount" inputMode="decimal" autoComplete="off" placeholder="0" aria-invalid={!!errors.amount} aria-describedby="amount-err"
            className="min-h-[64px] w-full bg-transparent text-3xl font-bold tabular-nums outline-none" {...register("amount")} />
        </div>
        {err("amount")}
      </div>

      <Controller control={control} name="category" render={({ field }) => (
        <fieldset>
          <legend className="label">{t("exp.category")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => {
              const Icon = ICONS[c];
              const on = field.value === c;
              return (
                <label key={c} className={`flex min-h-[56px] cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-sky-700 ${on ? "border-field-700 bg-field-100" : "border-field-200 bg-white"}`}>
                  <input type="radio" className="sr-only" name="category" value={c} checked={on} onChange={() => field.onChange(c)} />
                  <Icon aria-hidden className="h-6 w-6 shrink-0 text-field-700" />
                  <span className="leading-tight">{t(`cat.${c}`)}</span>
                  {on && <Check aria-hidden className="ml-auto h-5 w-5 shrink-0" />}
                </label>
              );
            })}
          </div>
          {err("category")}
        </fieldset>
      )} />

      <Controller control={control} name="expenseFor" render={({ field }) => (
        <fieldset>
          <legend className="label">{t("exp.for")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["landowner", "farmer"] as const).map((person) => {
              const on = field.value === person;
              return (
                <label key={person} className={`flex min-h-touch cursor-pointer items-center gap-2 rounded-xl border-2 px-4 py-2 font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-sky-700 ${on ? "border-field-700 bg-field-100" : "border-field-200 bg-white"}`}>
                  <input type="radio" className="sr-only" name="expenseFor" value={person} checked={on} onChange={() => field.onChange(person)} />
                  <span>{t(`role.${person}`)}</span>
                  {on && <Check aria-hidden className="ml-auto h-5 w-5" />}
                </label>
              );
            })}
          </div>
        </fieldset>
      )} />

      <div>
        <label htmlFor="date" className="label">{t("exp.date")}</label>
        <input id="date" type="date" className="input" max={localToday()} {...register("date")} aria-describedby="date-err" />
        {err("date")}
      </div>

      <div>
        <label htmlFor="description" className="label">{t("exp.description")} <span className="font-normal text-ink-soft">({t("common.optional")})</span></label>
        <input id="description" className="input" maxLength={200} placeholder={t("exp.descriptionPh")} {...register("description")} />
      </div>

      <button type="button" className="btn btn-quiet w-full" aria-expanded={showMore} onClick={() => setShowMore((s) => !s)}>{t("exp.moreOptions")}</button>
      {showMore && (
        <div className="space-y-4">
          <div>
            <label htmlFor="method" className="label">{t("exp.method")}</label>
            <select id="method" className="input" {...register("method")}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`pm.${m}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="label">{t("exp.notes")}</label>
            <textarea id="notes" rows={3} maxLength={500} className="input" {...register("notes")} />
          </div>
        </div>
      )}

      {mode === "new" && <ReceiptPicker file={file} onChange={setFile} />}

      {mode === "edit" && (
        <div>
          <label htmlFor="reason" className="label">{t("exp.reason")}</label>
          <textarea id="reason" rows={2} className="input" aria-describedby="reason-err" {...register("reason")} />
          {err("reason")}
        </div>
      )}

      {!online && <p role="status" className="font-semibold text-chili-700">{t("common.offlineBanner")}</p>}
      {formError && <p role="alert" className="rounded-xl border-2 border-chili-700 bg-chili-50 p-3 font-semibold">{t(formError)}</p>}
      <button type="submit" disabled={isSubmitting || !online} className="btn btn-primary w-full text-lg">
        {isSubmitting ? t("common.saving") : t("exp.save")}
      </button>
      {mode === "new" && <p className="text-center text-sm text-ink-soft">{t("common.draftSaved")}</p>}
    </form>
  );
}
