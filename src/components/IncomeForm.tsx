"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { addIncome } from "@/app/actions";
import { parseRupeesToPaise } from "@/lib/money";
import { INCOME_KINDS, QUANTITY_UNITS } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";
import type { Key } from "@/lib/i18n";
import { clearDraft, draftKey, localToday, readDraft, useOnlineHook, writeDraft } from "./draft";
import { ReceiptPicker } from "./ReceiptPicker";
import { uploadAttachment } from "./upload";

interface V {
  kind: string; direction: "in" | "out"; amount: string; date: string; buyer: string; quantity: string; unit: string;
  unitPrice: string; paymentStatus: "received" | "pending"; receivedBy: string; paymentDetails: string; notes: string;
}

export function IncomeForm({ projectId, members, meMemberId }: { projectId: string; members: { id: string; name: string }[]; meMemberId: string }) {
  const t = useT();
  const router = useRouter();
  const online = useOnlineHook();
  const key = draftKey(projectId, "income");
  const clientId = useRef("");
  const blank: V = { kind: "crop_sale", direction: "in", amount: "", date: "", buyer: "", quantity: "", unit: "", unitPrice: "", paymentStatus: "received", receivedBy: meMemberId, paymentDetails: "", notes: "" };
  const [v, setV] = useState<V>(blank);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof V | "form", Key>>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Key | null>(null);

  useEffect(() => {
    clientId.current = crypto.randomUUID();
    const d = readDraft<{ v: V; clientId: string }>(key);
    if (d?.v) { setV({ ...blank, ...d.v, date: d.v.date || localToday() }); if (d.clientId) clientId.current = d.clientId; }
    else setV((p) => ({ ...p, date: localToday() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!v.amount && !v.notes && !v.buyer) { clearDraft(key); return; }
    writeDraft(key, { v, clientId: clientId.current });
  }, [v, key]);

  const set = <K extends keyof V>(k: K, val: V[K]) => setV((p) => ({ ...p, [k]: val }));
  const isCrop = v.kind === "crop_sale";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: typeof errors = {};
    const paise = parseRupeesToPaise(v.amount);
    if (!paise) errs.amount = "err.FH_INVALID_AMOUNT";
    if (v.kind === "adjustment" && v.notes.trim().length < 3) errs.notes = "err.FH_REASON_REQUIRED";
    if (v.paymentStatus === "received" && !v.receivedBy) errs.receivedBy = "common.required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (!online) return setErrors({ form: "common.networkError" });
    setBusy(true);
    try {
      const r = await addIncome({ projectId, clientId: clientId.current || crypto.randomUUID(), ...v, unit: v.unit as "", });
      if (!r.ok) {
        setErrors({ form: r.errorKey, ...(r.fieldErrors ?? {}) });
        return;
      }
      clearDraft(key);
      if (file) {
        const up = await uploadAttachment(projectId, "income", r.incomeId, file);
        if (!up.ok) { setErrors({ form: "exp.uploadFailed" }); }
      }
      setDone("inc.saved");
      router.refresh();
    } catch {
      setErrors({ form: "common.networkError" });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4" role="status">
        <div className="card text-center">
          <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-field-700 text-white"><Check aria-hidden className="h-8 w-8" /></span>
          <p className="text-xl font-bold">{t(done)}</p>
          {errors.form && <p role="alert" className="field-error">{t(errors.form)}</p>}
        </div>
        <Link href={`/p/${projectId}/income`} className="btn btn-green w-full">{t("inc.title")}</Link>
      </div>
    );
  }

  const fe = (k: keyof V) => (errors[k] ? <p role="alert" className="field-error">{t(errors[k] as Key)}</p> : null);
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="kind" className="label">{t("inc.kind")}</label>
        <select id="kind" className="input" value={v.kind} onChange={(e) => set("kind", e.target.value)}>
          {INCOME_KINDS.map((k) => <option key={k} value={k}>{t(`inc.kind.${k}`)}</option>)}
        </select>
      </div>
      {v.kind === "adjustment" && (
        <fieldset>
          <legend className="label">{t("inc.direction")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["in", "out"] as const).map((d) => (
              <label key={d} className={`flex min-h-touch cursor-pointer items-center justify-center rounded-xl border-2 px-3 text-center font-semibold ${v.direction === d ? "border-field-700 bg-field-100" : "border-field-200 bg-white"}`}>
                <input type="radio" className="sr-only" name="direction" checked={v.direction === d} onChange={() => set("direction", d)} />
                {d === "in" ? t("inc.moneyIn") : t("inc.moneyOut")}
              </label>
            ))}
          </div>
          <p className="hint">{t("inc.adjustNote")}</p>
        </fieldset>
      )}
      <div>
        <label htmlFor="amount" className="label">{t("inc.amount")}</label>
        <div className="flex items-center gap-2 rounded-xl border-2 border-field-200 bg-white px-4 focus-within:border-field-700">
          <span aria-hidden className="text-3xl font-bold text-field-700">₹</span>
          <input id="amount" inputMode="decimal" autoComplete="off" placeholder="0" value={v.amount} onChange={(e) => set("amount", e.target.value)}
            className="min-h-[64px] w-full bg-transparent text-3xl font-bold tabular-nums outline-none" aria-invalid={!!errors.amount} />
        </div>
        {fe("amount")}
      </div>
      <div>
        <label htmlFor="date" className="label">{t("common.date")}</label>
        <input id="date" type="date" className="input" max={localToday()} value={v.date} onChange={(e) => set("date", e.target.value)} />
      </div>

      <fieldset>
        <legend className="label">{t("inc.paymentStatus")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["received", "pending"] as const).map((s) => (
            <label key={s} className={`flex min-h-touch cursor-pointer items-center justify-center rounded-xl border-2 px-3 text-center font-semibold ${v.paymentStatus === s ? "border-field-700 bg-field-100" : "border-field-200 bg-white"}`}>
              <input type="radio" className="sr-only" name="ps" checked={v.paymentStatus === s} onChange={() => set("paymentStatus", s)} />
              {s === "received" ? t("inc.received") : t("inc.pending")}
            </label>
          ))}
        </div>
        {v.paymentStatus === "pending" && <p className="hint">{t("inc.pendingExplain")}</p>}
      </fieldset>

      {v.paymentStatus === "received" && (
        <div>
          <label htmlFor="by" className="label">{t("inc.receivedBy")}</label>
          <select id="by" className="input" value={v.receivedBy} onChange={(e) => set("receivedBy", e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === meMemberId ? ` (${t("common.you")})` : ""}</option>)}
          </select>
          {fe("receivedBy")}
        </div>
      )}

      {isCrop && (
        <>
          <div>
            <label htmlFor="buyer" className="label">{t("inc.buyer")} <span className="font-normal text-ink-soft">({t("common.optional")})</span></label>
            <input id="buyer" className="input" maxLength={120} value={v.buyer} onChange={(e) => set("buyer", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qty" className="label">{t("inc.qty")}</label>
              <input id="qty" inputMode="decimal" className="input" value={v.quantity} onChange={(e) => set("quantity", e.target.value)} />
              {fe("quantity")}
            </div>
            <div>
              <label htmlFor="unit" className="label">{t("inc.unit")}</label>
              <select id="unit" className="input" value={v.unit} onChange={(e) => set("unit", e.target.value)}>
                <option value="">—</option>
                {QUANTITY_UNITS.map((u) => <option key={u} value={u}>{t(`qu.${u}`)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="up" className="label">{t("inc.unitPrice")}</label>
            <input id="up" inputMode="decimal" className="input" value={v.unitPrice} onChange={(e) => set("unitPrice", e.target.value)} />
            {fe("unitPrice")}
          </div>
        </>
      )}
      <div>
        <label htmlFor="pd" className="label">{t("inc.paymentDetails")} <span className="font-normal text-ink-soft">({t("common.optional")})</span></label>
        <input id="pd" className="input" maxLength={300} value={v.paymentDetails} onChange={(e) => set("paymentDetails", e.target.value)} />
      </div>
      <div>
        <label htmlFor="notes" className="label">{t("common.notes")}{v.kind !== "adjustment" && <span className="font-normal text-ink-soft"> ({t("common.optional")})</span>}</label>
        <textarea id="notes" rows={3} maxLength={500} className="input" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
        {fe("notes")}
      </div>
      <ReceiptPicker file={file} onChange={setFile} label={t("inc.document")} />

      {!online && <p role="status" className="font-semibold text-chili-700">{t("common.offlineBanner")}</p>}
      {errors.form && <p role="alert" className="rounded-xl border-2 border-chili-700 bg-chili-50 p-3 font-semibold">{t(errors.form)}</p>}
      <button type="submit" disabled={busy || !online} className="btn btn-primary w-full text-lg">{busy ? t("common.saving") : t("inc.save")}</button>
      <p className="text-center text-sm text-ink-soft">{t("common.draftSaved")}</p>
    </form>
  );
}
