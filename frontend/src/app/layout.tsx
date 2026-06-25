import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Aleph-Tav Engine - Interlinear Hebrew/English Scripture",
  description: "An advanced interlinear scripture platform with morphology, transliteration, and Strong's lexicon definitions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-neutral-950 text-neutral-100 flex flex-col md:flex-row selection:bg-amber-500/30 selection:text-amber-200">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-screen pb-16 md:pb-0">
          <div className="flex-1 flex flex-col px-4 md:px-8 py-6 w-full">
            <main className="flex-1 flex flex-col">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
