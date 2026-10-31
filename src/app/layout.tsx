import type { Metadata, Viewport } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import { HackmateProvider } from "@/components/HackmateProvider";
import { Nav } from "@/components/Nav";
import { LoadingShell } from "@/components/LoadingShell";
import { SignInGate } from "@/components/SignInGate";
import { ConfirmProvider } from "@/components/ui/Confirm";
import { ToastProvider } from "@/components/ui/Toast";
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

const DESCRIPTION = "Find hackathons from 10 sites, understand their rules with AI, and track every entry to the finish.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  title: "HackMate",
  applicationName: "HackMate",
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "HackMate", title: "HackMate", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "HackMate", description: DESCRIPTION },
};

// The browser's toolbar takes the page colour, light or dark.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff4d6" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1916" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets data-theme before React loads, so the attribute differs from the server HTML on purpose.
    <html lang="en" className={`${display.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <Script id="theme" strategy="beforeInteractive">{themeScript}</Script>
        {/* Everything below reads the clock and live data on the client, so nothing is prerendered. */}
        <Suspense fallback={<LoadingShell />}>
          <HackmateProvider>
            <ConfirmProvider>
              <ToastProvider>
                <Nav />
                <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
                  <SignInGate>{children}</SignInGate>
                </main>
              </ToastProvider>
            </ConfirmProvider>
          </HackmateProvider>
        </Suspense>
      </body>
    </html>
  );
}
