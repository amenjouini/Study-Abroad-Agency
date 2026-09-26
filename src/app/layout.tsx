import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { dirFor, isLocale } from "@/i18n/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bon Ita", template: "%s · Bon Ita" },
  description: "Study-in-Italy agency CRM and student portal",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : "fr";
  const messages = await getMessages();
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
