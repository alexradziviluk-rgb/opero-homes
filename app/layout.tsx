import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { resolvePublicSiteUrl } from "@/lib/auth/site-url";
import AnalyticsScripts from "@/components/analytics/AnalyticsScripts";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(resolvePublicSiteUrl()),
  title: {
    default: "Opero Homes | Управление недвижимостью",
    template: "%s | Opero Homes",
  },
  description: "Публичный каталог недвижимости и рабочее пространство Opero Homes для владельцев и команд.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Opero Homes",
    title: "Opero Homes | Управление недвижимостью",
    description: "Публичный каталог недвижимости и рабочее пространство Opero Homes.",
    url: "/",
  },
  robots: { index: true, follow: true },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} w-full h-full antialiased`}
    >
      <body className="w-full min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
        <AnalyticsScripts />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
