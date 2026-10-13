import type { ExpenseStatus, IncomeKind } from "./settlement";

export type Role = "farmer" | "landowner" | "partner";
export const CATEGORIES = ["seeds", "fertilizers", "pesticides", "labour", "machinery", "irrigation", "transport", "land_preparation", "harvesting", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const PAYMENT_METHODS = ["cash", "upi", "bank", "credit", "other"] as const;
export const QUANTITY_UNITS = ["quintal", "kg", "ton", "bag", "piece", "other"] as const;
export const INCOME_KINDS: IncomeKind[] = ["crop_sale", "other_income", "refund_received", "adjustment"];

export interface Project {
  id: string; name: string; crop_name: string; season: string; village: string | null;
  land_area: number | null; land_area_unit: string | null;
  status: "active" | "harvesting" | "settled" | "archived";
  approval_policy: "notify_only" | "require_confirmation";
  created_at: string; last_activity_at: string;
}
export interface Member {
  id: string; project_id: string; user_id: string; role: Role; is_admin: boolean;
  display_name: string; status: "active" | "removed";
}
export interface ExpenseRow {
  id: string; project_id: string; amount_paise: number; category: Category; expense_for: "landowner" | "farmer"; paid_by: string; created_by: string;
  expense_date: string; description: string | null; payment_method: string | null; notes: string | null;
  status: ExpenseStatus; reversal_reason: string | null; created_at: string;
}
export interface IncomeRow {
  id: string; project_id: string; kind: IncomeKind; amount_paise: number; income_date: string; buyer: string | null;
  quantity: number | null; quantity_unit: string | null; unit_price_paise: number | null;
  payment_status: "received" | "pending"; received_by: string | null; payment_details: string | null; notes: string | null;
  status: "active" | "reversed"; created_by: string; reversal_reason: string | null;
}
export interface PaymentRow {
  id: string; project_id: string; from_member: string; to_member: string; amount_paise: number;
  paid_on: string; method: string | null; note: string | null; status: "active" | "reversed";
}
export interface AgreementRow { id: string; project_id: string; version: number; status: "proposed" | "approved" | "superseded"; created_at: string }
export interface ShareRow { agreement_id: string; member_id: string; expense_bps: number; profit_bps: number }
export interface HistoryRow { id: string; from_status: string | null; to_status: string; action: string; note: string | null; actor: string; created_at: string }
export interface AttachmentRow { id: string; entity_type: "expense" | "income"; entity_id: string; storage_path: string; mime_type: string; size_bytes: number; uploaded_by: string; removed_at: string | null }
export interface SettlementRow {
  id: string; version: number; basis: "received" | "recorded"; status: "pending_confirmation" | "final" | "superseded" | "void";
  snapshot: { result: import("./settlement").SettlementResult; input: import("./settlement").SettlementInput; generatedAt: string; agreementVersion: number };
  created_at: string; finalized_at: string | null;
}
