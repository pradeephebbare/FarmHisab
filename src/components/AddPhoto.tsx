"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { ReceiptPicker } from "./ReceiptPicker";
import { uploadAttachment } from "./upload";
import type { Key } from "@/lib/i18n";

export function AddPhoto({ projectId, entity, entityId }: { projectId: string; entity: "expense" | "income"; entityId: string }) {
  const t = useT();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Key | null>(null);
  async function go() {
    if (!file || busy) return;
    setBusy(true);
    setErr(null);
    const r = await uploadAttachment(projectId, entity, entityId, file);
    setBusy(false);
    if (r.ok) { setFile(null); router.refresh(); } else setErr(r.errorKey);
  }
  return (
    <div className="space-y-2">
      <ReceiptPicker file={file} onChange={setFile} />
      {file && <button type="button" className="btn btn-green w-full" disabled={busy} onClick={go}>{busy ? t("exp.uploading") : err ? t("exp.retryUpload") : t("common.save")}</button>}
      {err && <p role="alert" className="field-error">{t(err)}</p>}
    </div>
  );
}
