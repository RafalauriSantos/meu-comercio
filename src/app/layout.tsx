import type { Metadata } from "next";
<<<<<<< HEAD
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
=======
import { Inter } from "next/font/google";
>>>>>>> origin/main
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Meu Comércio",
  description: "PDV e Gestão Financeira para Pequeno Varejo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
<<<<<<< HEAD
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
=======
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
>>>>>>> origin/main
    </html>
  );
}
