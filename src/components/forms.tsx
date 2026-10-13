"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createProject, recordPayment } from "@/app/actions";
import { parseRupeesToPaise } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/types";
import { useT } from "@/lib/i18n/provider";
import type { Key } from "@/lib/i18n";
import { localToday } from "./hooks";

export function ProjectForm({ defaultName }: { defaultName: string }) {
  const t = useT();
  const router = useRouter();
  const [v, setV] = useState({ name: "", crop: "", season: String(new Date().getFullYear()), village: "", area: "", unit: "acre", displayName: defaultName });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Key | null>(null);
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!v.name.trim() || !v.crop.trim() || !v.season.trim() || !v.displayName.trim()) return setErr("common.required");
    setBusy(true);
    setErr(null);
    try {
      const r = await createProject({ ...v, unit: v.unit as "acre" | "guntha" | "hectare" });
      if (!r.ok) return setErr(r.errorKey);
      router.push(`/p/${r.projectId}`);
    } catch {
      setErr("common.networkError");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div><label className="label" htmlFor="name">{t("proj.name")}</label><input id="name" className="input" placeholder={t("proj.namePh")} maxLength={120} value={v.name} onChange={(e) => set("name", e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="crop">{t("proj.crop")}</label><input id="crop" className="input" maxLength={80} value={v.crop} onChange={(e) => set("crop", e.target.value)} /></div>
        <div><label className="label" htmlFor="season">{t("proj.season")}</label><input id="season" className="input" maxLength={40} value={v.season} onChange={(e) => set("season", e.target.value)} /></div>
      </div>
      <div><label className="label" htmlFor="village">{t("proj.village")} <span className="font-normal text-ink-soft">({t("common.optional")})</span></label><input id="village" className="input" maxLength={120} value={v.village} onChange={(e) => set("village", e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="area">{t("proj.area")} <span className="font-normal text-ink-soft">({t("common.optional")})</span></label><input id="area" inputMode="decimal" className="input" value={v.area} onChange={(e) => set("area", e.target.value)} /></div>
        <div><label className="label" htmlFor="unit">{t("proj.unit")}</label>
          <select id="unit" className="input" value={v.unit} onChange={(e) => set("unit", e.target.value)}>{(["acre", "guntha", "hectare"] as const).map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}</select></div>
      </div>
      <div><label className="label" htmlFor="dn">{t("proj.myName")}</label><input id="dn" className="input" maxLength={80} value={v.displayName} onChange={(e) => set("displayName", e.target.value)} /></div>
      {err && <p role="alert" className="field-error">{t(err)}</p>}
      <button className="btn btn-green w-full" disabled={busy} type="submit">{busy ? t("common.saving") : t("proj.createBtn")}</button>
    </form>
  );
}


export function PaymentForm({ projectId, members, meMemberId }: { projectId: string; members: { id: string; name: string }[]; meMemberId: string }) {
  const t = useT();
  const router = useRouter();
  const clientId = useRef("");
  const other = members.find((m) => m.id !== meMemberId)?.id ?? "";
  const [v, setV] = useState({ from: meMemberId, to: other, amount: "", date: "", method: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Key | null>(null);
  const [amountErr, setAmountErr] = useState(false);
  useEffect(() => { clientId.current = crypto.randomUUID(); setV((p) => ({ ...p, date: localToday() })); }, []);
  const set = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!parseRupeesToPaise(v.amount)) return setAmountErr(true);
    setAmountErr(false);
    setBusy(true);
    setErr(null);
    try {
      const r = await recordPayment({ projectId, clientId: clientId.current, ...v, method: v.method as "" });
      if (!r.ok) return setErr(r.errorKey);
      clientId.current = crypto.randomUUID();
      setV((p) => ({ ...p, amount: "", note: "" }));
      router.refresh();
    } catch {
      setErr("common.networkError");
    } finally {
      setBusy(false);
    }
  }
  const person = (id: string) => `${members.find((m) => m.id === id)?.name ?? ""}`;
  return (
    <form onSubmit={go} className="card space-y-4" noValidate>
      <p className="font-bold">{t("pay.add")}</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="pf">{t("pay.from")}</label>
          <select id="pf" className="input" value={v.from} onChange={(e) => set("from", e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{person(m.id)}</option>)}</select></div>
        <div><label className="label" htmlFor="pt">{t("pay.to")}</label>
          <select id="pt" className="input" value={v.to} onChange={(e) => set("to", e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{person(m.id)}</option>)}</select></div>
      </div>
      <div><label className="label" htmlFor="pa">{t("common.amount")}</label><input id="pa" inputMode="decimal" className="input" value={v.amount} onChange={(e) => set("amount", e.target.value)} />
        {amountErr && <p role="alert" className="field-error">{t("err.FH_INVALID_AMOUNT")}</p>}</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="pd">{t("common.date")}</label><input id="pd" type="date" className="input" max={localToday()} value={v.date} onChange={(e) => set("date", e.target.value)} /></div>
        <div><label className="label" htmlFor="pm">{t("pay.method")}</label>
          <select id="pm" className="input" value={v.method} onChange={(e) => set("method", e.target.value)}><option value="">—</option>{PAYMENT_METHODS.filter((m) => m !== "credit").map((m) => <option key={m} value={m}>{t(`pm.${m}`)}</option>)}</select></div>
      </div>
      <div><label className="label" htmlFor="pn">{t("common.notes")}</label><input id="pn" className="input" maxLength={300} value={v.note} onChange={(e) => set("note", e.target.value)} /></div>
      {err && <p role="alert" className="field-error">{t(err)}</p>}
      <button className="btn btn-green w-full" disabled={busy || v.from === v.to} type="submit">{busy ? t("common.saving") : t("pay.save")}</button>
    </form>
  );
}
