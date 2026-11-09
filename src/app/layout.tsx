import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Meu Comércio",
  description: "PDV e Gestão Financeira para Pequeno Varejo",
  applicationName: "Meu Comércio",
  // The manifest (src/app/manifest.ts) makes the app installable; this is for Apple devices. The icons are
  // files (icon.svg, apple-icon.png): setting `icons` here would hide them.
  appleWebApp: { capable: true, title: "Meu Comércio", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2457c5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
