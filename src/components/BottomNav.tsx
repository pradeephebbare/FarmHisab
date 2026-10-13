"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, IndianRupee, Menu, Receipt, Scale } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

export function BottomNav({ projectId }: { projectId: string }) {
  const t = useT();
  const path = usePathname();
  const base = `/p/${projectId}`;
  const items = [
    { href: base, label: t("nav.home"), Icon: Home, match: (p: string) => p === base },
    { href: `${base}/expenses`, label: t("nav.expenses"), Icon: Receipt, match: (p: string) => p.startsWith(`${base}/expenses`) },
    { href: `${base}/income`, label: t("nav.income"), Icon: IndianRupee, match: (p: string) => p.startsWith(`${base}/income`) },
    { href: `${base}/settlement`, label: t("nav.settlement"), Icon: Scale, match: (p: string) => p.startsWith(`${base}/settlement`) },
    { href: `${base}/more`, label: t("nav.more"), Icon: Menu, match: (p: string) => /\/(more|terms|payments)/.test(p.slice(base.length)) },
  ];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {items.map(({ href, label, Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 px-1 text-[13px] font-semibold leading-tight ${active ? "text-field-800" : "text-ink-soft"}`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-field-100" : ""}`}>
                  <Icon aria-hidden className="h-6 w-6" />
                </span>
                <span className="text-center">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
