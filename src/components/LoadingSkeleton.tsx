"use client";

import { useT } from "@/lib/i18n/provider";

function Bone({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse motion-reduce:animate-none rounded-lg bg-field-100 ${className}`} />;
}

export function LoadingSkeleton({ variant }: { variant: "page" | "project" }) {
  const t = useT();

  return (
    <div role="status" aria-label={t("common.loading")} aria-busy="true" className="space-y-4">
      <span className="sr-only">{t("common.loading")}</span>
      {variant === "page" ? (
        <>
          <header className="flex items-center gap-3 py-2">
            <Bone className="h-12 w-12 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Bone className="h-5 w-36 max-w-full" />
              <Bone className="h-4 w-56 max-w-full" />
            </div>
          </header>
          <section className="card space-y-4" aria-hidden="true">
            <Bone className="h-8 w-2/5" />
            <Bone className="h-14 w-full" />
            <Bone className="h-14 w-full" />
            <Bone className="h-14 w-full" />
            <Bone className="h-14 w-2/3" />
          </section>
        </>
      ) : (
        <>
          <header className="space-y-2 py-1">
            <Bone className="h-7 w-2/5" />
            <Bone className="h-4 w-3/5" />
          </header>
          <Bone className="h-16 w-full rounded-xl" />
          <section className="khata space-y-4" aria-hidden="true">
            <Bone className="h-5 w-2/5" />
            <Bone className="h-10 w-1/2" />
            <Bone className="h-5 w-full" />
            <Bone className="h-5 w-4/5" />
          </section>
          <section className="card space-y-3" aria-hidden="true">
            <Bone className="h-6 w-2/5" />
            <Bone className="h-5 w-full" />
            <Bone className="h-5 w-4/5" />
          </section>
          <ul className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <li key={item} className="card flex items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <Bone className="h-5 w-2/5" />
                  <Bone className="h-4 w-3/5" />
                </div>
                <Bone className="h-6 w-20 shrink-0" />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}