import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Kannada } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/provider";

const sans = Noto_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const kn = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--font-kn", display: "swap" });

export const metadata: Metadata = {
  title: { default: "FarmHisab", template: "%s · FarmHisab" },
  description: "Every Expense. Every Harvest. Every Rupee Accounted For.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#235330" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${sans.variable} ${kn.variable}`}>
      <body className="font-sans">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
