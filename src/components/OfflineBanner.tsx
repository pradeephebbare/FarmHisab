"use client";
import { WifiOff } from "lucide-react";
import { useOnline } from "./hooks";
import { useT } from "@/lib/i18n/provider";

export function OfflineBanner() {
  const online = useOnline();
  const t = useT();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-30 flex items-center gap-2 bg-ink px-4 py-2 text-sm font-semibold text-white">
      <WifiOff aria-hidden className="h-4 w-4" />
      {t("common.offlineBanner")}
    </div>
  );
}
