import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { HackmateProvider } from "@/components/HackmateProvider";
import { Nav } from "@/components/Nav";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ConfirmProvider } from "@/components/ui/Confirm";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
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
