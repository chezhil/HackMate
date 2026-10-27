import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import { HackmateProvider } from "@/components/HackmateProvider";
import { Nav } from "@/components/Nav";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { themeScript } from "@/lib/themeScript";
import "./globals.css";

// Chunky grotesque for the neobrutalist look; Geist Mono stays for code and numbers.
const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HackMate",
  description: "Find hackathons, track your entries and never miss a deadline.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets data-theme before React loads, so the attribute differs from the server HTML on purpose.
    <html lang="en" className={`${display.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <Script id="theme" strategy="beforeInteractive">{themeScript}</Script>
        {/* Everything below reads the clock and live data on the client, so nothing is prerendered. */}
        <Suspense
          fallback={
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
              <PageSkeleton />
            </main>
          }
        >
          <HackmateProvider>
            <ConfirmProvider>
              <Nav />
              <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
            </ConfirmProvider>
          </HackmateProvider>
        </Suspense>
      </body>
    </html>
  );
}
