"use client";
import { Camera, X } from "lucide-react";
import { useRef } from "react";
import { useT } from "@/lib/i18n/provider";
import { checkImage } from "./upload";
import { useState } from "react";

export function ReceiptPicker({ file, onChange, label }: { file: File | null; onChange: (f: File | null) => void; label?: string }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState(false);
  return (
    <div>
      <span className="label">{label ?? t("exp.receipt")} <span className="font-normal text-ink-soft">({t("common.optional")})</span></span>
      <input
        ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" id="receipt-input"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f && checkImage(f)) { setErr(true); onChange(null); e.target.value = ""; return; }
          setErr(false);
          onChange(f);
        }}
      />
      {file ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-field-200 bg-white p-3">
          <span className="truncate font-semibold">{file.name}</span>
          <button type="button" className="btn btn-quiet px-3" aria-label={t("exp.removePhoto")} onClick={() => { onChange(null); if (ref.current) ref.current.value = ""; }}>
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <label htmlFor="receipt-input" className="btn btn-quiet w-full cursor-pointer">
          <Camera aria-hidden className="h-5 w-5" />
          {t("exp.addPhoto")}
        </label>
      )}
      <p className={err ? "field-error" : "hint"}>{err ? t("exp.photoBad") : t("exp.photoHint")}</p>
    </div>
  );
}
