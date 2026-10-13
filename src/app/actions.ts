"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildSettlementInput, loadLedger, loadProject } from "@/lib/data";
import { parseRupeesToPaise } from "@/lib/money";
import { computeSettlement, TermsError } from "@/lib/settlement";
import { CATEGORIES, INCOME_KINDS, PAYMENT_METHODS, QUANTITY_UNITS } from "@/lib/types";
import { en, type Key } from "@/lib/i18n/en";
import { LANG_COOKIE, isLocale } from "@/lib/i18n";

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; errorKey: Key; fieldErrors?: Record<string, Key> };

function fail(error: unknown): { ok: false; errorKey: Key } {
  const msg = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
  const code = /FH_[A-Z_]+/.exec(msg)?.[0];
  const key = `err.${code}` as Key;
  if (code && key in en) return { ok: false, errorKey: key };
  if (/fetch failed|network/i.test(msg)) return { ok: false, errorKey: "common.networkError" };
  console.error("[farmhisab] unexpected error:", msg);
  return { ok: false, errorKey: "err.generic" };
}

const uuid = z.string().uuid();
const optText = (max: number) => z.string().trim().max(max).optional().default("");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export async function setLanguage(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LANG_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.from("profiles").update({ preferred_language: locale }).eq("id", data.user.id);
  revalidatePath("/", "layout");
}

// ---------- projects ----------
const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  crop: z.string().trim().min(1).max(80),
  season: z.string().trim().min(1).max(40),
  village: optText(120),
  area: z.string().trim().optional().default(""),
  unit: z.enum(["acre", "guntha", "hectare"]).optional(),
  displayName: z.string().trim().min(1).max(80),
});
export async function createProject(raw: z.input<typeof projectSchema>): Promise<Result<{ projectId: string }>> {
  const p = projectSchema.safeParse(raw);
  if (!p.success) return { ok: false, errorKey: "common.required" };
  const area = p.data.area ? Number(p.data.area) : null;
  if (area !== null && (!Number.isFinite(area) || area <= 0)) return { ok: false, errorKey: "common.required" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_project", {
      p_name: p.data.name, p_crop: p.data.crop, p_season: p.data.season, p_village: p.data.village || null,
      p_area: area, p_unit: area !== null ? (p.data.unit ?? "acre") : null, p_role: "landowner", p_display_name: p.data.displayName,
    });
    if (error) return fail(error);
    revalidatePath("/");
    return { ok: true, projectId: data as string };
  } catch (e) {
    return fail(e);
  }
}

async function simpleRpc(fn: string, args: Record<string, unknown>, projectId: string): Promise<Result> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(fn, args);
    if (error) return fail(error);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMember(projectId: string, memberId: string): Promise<Result> {
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(memberId).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("remove_member", { p_member: memberId }, projectId);
}
export async function setApprovalPolicy(projectId: string, policy: string): Promise<Result> {
  if (!uuid.safeParse(projectId).success || !["notify_only", "require_confirmation"].includes(policy)) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("set_approval_policy", { p_project: projectId, p_policy: policy }, projectId);
}
export async function setProjectStatus(projectId: string, status: string): Promise<Result> {
  if (!uuid.safeParse(projectId).success || !["active", "harvesting", "archived"].includes(status)) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("set_project_status", { p_project: projectId, p_status: status }, projectId);
}

// ---------- agreement ----------
const sharesSchema = z.array(z.object({ member_id: uuid, expense_bps: z.number().int().min(0).max(10000), profit_bps: z.number().int().min(0).max(10000) })).min(1);
export async function proposeAgreement(projectId: string, shares: unknown): Promise<Result> {
  const s = sharesSchema.safeParse(shares);
  if (!uuid.safeParse(projectId).success || !s.success) return { ok: false, errorKey: "err.FH_INVALID" };
  if (s.data.reduce((a, x) => a + x.expense_bps, 0) !== 10000 || s.data.reduce((a, x) => a + x.profit_bps, 0) !== 10000) return { ok: false, errorKey: "err.FH_SHARES_NOT_100" };
  return simpleRpc("propose_agreement", { p_project: projectId, p_shares: s.data }, projectId);
}
export async function approveAgreement(projectId: string, agreementId: string): Promise<Result> {
  if (!uuid.safeParse(agreementId).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("approve_agreement", { p_agreement: agreementId }, projectId);
}

// ---------- expenses ----------
const expenseSchema = z.object({
  projectId: uuid,
  clientId: uuid,
  amount: z.string(),
  category: z.enum(CATEGORIES),
  expenseFor: z.enum(["landowner", "farmer"]),
  paidBy: uuid,
  date: dateStr,
  description: optText(200),
  method: z.enum([...PAYMENT_METHODS, ""]).optional().default(""),
  notes: optText(500),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

export async function addExpense(raw: ExpenseInput): Promise<Result<{ expenseId: string }>> {
  const p = expenseSchema.safeParse(raw);
  if (!p.success) return { ok: false, errorKey: "common.required" };
  const paise = parseRupeesToPaise(p.data.amount);
  if (!paise || paise <= 0) return { ok: false, errorKey: "err.FH_INVALID_AMOUNT", fieldErrors: { amount: "err.FH_INVALID_AMOUNT" } };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("add_expense", {
      p_project: p.data.projectId, p_client_id: p.data.clientId, p_amount: paise, p_category: p.data.category, p_expense_for: p.data.expenseFor, p_paid_by: p.data.paidBy,
      p_date: p.data.date, p_description: p.data.description, p_payment_method: p.data.method, p_notes: p.data.notes,
    });
    if (error) return fail(error);
    revalidatePath(`/p/${p.data.projectId}`, "layout");
    return { ok: true, expenseId: data as string };
  } catch (e) {
    return fail(e);
  }
}

export async function amendExpense(expenseId: string, raw: ExpenseInput, reason: string): Promise<Result> {
  const p = expenseSchema.safeParse(raw);
  if (!p.success || !uuid.safeParse(expenseId).success) return { ok: false, errorKey: "common.required" };
  const paise = parseRupeesToPaise(p.data.amount);
  if (!paise) return { ok: false, errorKey: "err.FH_INVALID_AMOUNT", fieldErrors: { amount: "err.FH_INVALID_AMOUNT" } };
  return simpleRpc("amend_expense", {
    p_expense: expenseId, p_amount: paise, p_category: p.data.category, p_expense_for: p.data.expenseFor, p_paid_by: p.data.paidBy, p_date: p.data.date,
    p_description: p.data.description, p_payment_method: p.data.method, p_notes: p.data.notes, p_reason: reason.trim().slice(0, 300),
  }, p.data.projectId);
}

export async function reviewExpense(projectId: string, expenseId: string, action: "confirm" | "dispute" | "resolve", note: string): Promise<Result> {
  if (!uuid.safeParse(expenseId).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("review_expense", { p_expense: expenseId, p_action: action, p_note: note.trim().slice(0, 300) || null }, projectId);
}
export async function reverseExpense(projectId: string, expenseId: string, reason: string): Promise<Result> {
  if (!uuid.safeParse(expenseId).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("reverse_expense", { p_expense: expenseId, p_reason: reason.trim().slice(0, 300) }, projectId);
}

// ---------- attachments ----------
export async function attachFile(projectId: string, entity: "expense" | "income", entityId: string, path: string, mime: string, size: number): Promise<Result> {
  if (!uuid.safeParse(entityId).success || !["image/jpeg", "image/png", "image/webp", "image/heic"].includes(mime) || size <= 0 || size > 5 * 1024 * 1024) {
    return { ok: false, errorKey: "exp.photoBad" };
  }
  return simpleRpc("add_attachment", { p_entity_type: entity, p_entity_id: entityId, p_path: path, p_mime: mime, p_size: size }, projectId);
}
export async function removeAttachment(projectId: string, attachmentId: string): Promise<Result> {
  if (!uuid.safeParse(attachmentId).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("remove_attachment", { p_attachment: attachmentId }, projectId);
}

// ---------- income ----------
const incomeSchema = z.object({
  projectId: uuid,
  clientId: uuid,
  kind: z.enum(INCOME_KINDS as [string, ...string[]]),
  direction: z.enum(["in", "out"]).default("in"),
  amount: z.string(),
  date: dateStr,
  buyer: optText(120),
  quantity: z.string().trim().optional().default(""),
  unit: z.enum([...QUANTITY_UNITS, ""]).optional().default(""),
  unitPrice: z.string().trim().optional().default(""),
  paymentStatus: z.enum(["received", "pending"]),
  receivedBy: z.string().optional().default(""),
  paymentDetails: optText(300),
  notes: optText(500),
});
export type IncomeInput = z.input<typeof incomeSchema>;
export async function addIncome(raw: IncomeInput): Promise<Result<{ incomeId: string }>> {
  const p = incomeSchema.safeParse(raw);
  if (!p.success) return { ok: false, errorKey: "common.required" };
  const paise = parseRupeesToPaise(p.data.amount);
  if (!paise) return { ok: false, errorKey: "err.FH_INVALID_AMOUNT", fieldErrors: { amount: "err.FH_INVALID_AMOUNT" } };
  const qty = p.data.quantity ? Number(p.data.quantity) : null;
  if (qty !== null && (!Number.isFinite(qty) || qty <= 0)) return { ok: false, errorKey: "common.required", fieldErrors: { quantity: "common.required" } };
  const unitPrice = p.data.unitPrice ? parseRupeesToPaise(p.data.unitPrice) : null;
  if (p.data.unitPrice && !unitPrice) return { ok: false, errorKey: "err.FH_INVALID_AMOUNT", fieldErrors: { unitPrice: "err.FH_INVALID_AMOUNT" } };
  const receivedBy = p.data.paymentStatus === "received" && uuid.safeParse(p.data.receivedBy).success ? p.data.receivedBy : null;
  const signed = p.data.kind === "adjustment" && p.data.direction === "out" ? -paise : paise;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("add_income", {
      p_project: p.data.projectId, p_client_id: p.data.clientId, p_kind: p.data.kind, p_amount: signed, p_date: p.data.date,
      p_buyer: p.data.buyer, p_quantity: qty, p_unit: p.data.unit, p_unit_price: unitPrice, p_payment_status: p.data.paymentStatus,
      p_received_by: receivedBy, p_payment_details: p.data.paymentDetails, p_notes: p.data.notes,
    });
    if (error) return fail(error);
    revalidatePath(`/p/${p.data.projectId}`, "layout");
    return { ok: true, incomeId: data as string };
  } catch (e) {
    return fail(e);
  }
}
export async function markIncomeReceived(projectId: string, incomeId: string, receivedBy: string): Promise<Result> {
  if (!uuid.safeParse(incomeId).success || !uuid.safeParse(receivedBy).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("mark_income_received", { p_income: incomeId, p_received_by: receivedBy }, projectId);
}
export async function reverseIncome(projectId: string, incomeId: string, reason: string): Promise<Result> {
  if (!uuid.safeParse(incomeId).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("reverse_income", { p_income: incomeId, p_reason: reason.trim().slice(0, 300) }, projectId);
}

// ---------- payments between partners ----------
const paymentSchema = z.object({
  projectId: uuid, clientId: uuid, from: uuid, to: uuid, amount: z.string(), date: dateStr,
  method: z.enum([...PAYMENT_METHODS, ""]).optional().default(""), note: optText(300),
});
export type PaymentInput = z.input<typeof paymentSchema>;
export async function recordPayment(raw: PaymentInput): Promise<Result> {
  const p = paymentSchema.safeParse(raw);
  if (!p.success) return { ok: false, errorKey: "common.required" };
  const paise = parseRupeesToPaise(p.data.amount);
  if (!paise) return { ok: false, errorKey: "err.FH_INVALID_AMOUNT", fieldErrors: { amount: "err.FH_INVALID_AMOUNT" } };
  return simpleRpc("record_payment", {
    p_project: p.data.projectId, p_client_id: p.data.clientId, p_from: p.data.from, p_to: p.data.to, p_amount: paise,
    p_date: p.data.date, p_method: p.data.method, p_note: p.data.note,
  }, p.data.projectId);
}
export async function reversePayment(projectId: string, paymentId: string, reason: string): Promise<Result> {
  if (!uuid.safeParse(paymentId).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("reverse_payment", { p_payment: paymentId, p_reason: reason.trim().slice(0, 300) }, projectId);
}

// ---------- settlement ----------
/** The snapshot is always recomputed here from database rows; the browser never supplies numbers. */
export async function createSettlement(projectId: string, basis: string): Promise<Result> {
  if (!uuid.safeParse(projectId).success || (basis !== "received" && basis !== "recorded")) return { ok: false, errorKey: "err.FH_INVALID" };
  try {
    const { supabase, project, members } = await loadProject(projectId);
    const ledger = await loadLedger(supabase, projectId);
    const input = buildSettlementInput(project, members, ledger, basis);
    if (!input) return { ok: false, errorKey: "err.FH_NO_AGREEMENT" };
    const result = computeSettlement(input);
    if (result.provisional) return { ok: false, errorKey: "set.blocked" };
    const snapshot = { version: 1, generatedAt: new Date().toISOString(), agreementVersion: ledger.approved?.version ?? 0, basis, input, result };
    const { error } = await supabase.rpc("create_settlement", { p_project: projectId, p_basis: basis, p_snapshot: snapshot });
    if (error) return fail(error);
    revalidatePath(`/p/${projectId}`, "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof TermsError) return { ok: false, errorKey: "err.FH_TERMS_INCOMPLETE" };
    return fail(e);
  }
}
export async function confirmSettlement(projectId: string, settlementId: string): Promise<Result> {
  if (!uuid.safeParse(settlementId).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("confirm_settlement", { p_settlement: settlementId }, projectId);
}
export async function amendSettlement(projectId: string, settlementId: string, reason: string): Promise<Result> {
  if (!uuid.safeParse(settlementId).success) return { ok: false, errorKey: "err.FH_INVALID" };
  return simpleRpc("amend_settlement", { p_settlement: settlementId, p_reason: reason.trim().slice(0, 500) }, projectId);
}
