import type { Metadata } from "next";
import { Suspense } from "react";
// Fonts ship in the geist package and load through next/font/local, so the build never calls Google Fonts.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/shared/sidebar";
import { StatusRow } from "@/components/shared/status-row";
import { DemoBanner } from "@/components/shared/demo-banner";
import { appMode } from "@/lib/mode";
import { allowsIndexing } from "@/lib/security-headers";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    title: {
      default: "Reloca: your relocation cockpit",
      template: "%s · Reloca",
    },
    description:
      "A personal relocation dashboard: cost of living, properties, community, checklist and lease. Everything for the move in one place.",
    // A private copy shows a real address and lease. Only the demo may be indexed.
    ...(allowsIndexing(appMode()) ? {} : { robots: { index: false, follow: false } }),
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <TooltipProvider delayDuration={150}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-md)] focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-sm"
          >
            Skip to content
          </a>
          <DemoBanner />
          {/* The bar reads the database. Streaming it keeps the page shell
              and the navigation from waiting on those reads. */}
          <Suspense
            fallback={
              <div aria-busy="true" className="h-12 border-b border-border bg-background/95" />
            }
          >
            <StatusRow />
          </Suspense>
          <div className="flex">
            <Sidebar />
            <main
              id="main"
              tabIndex={-1}
              className="min-h-[calc(100svh-3rem)] flex-1 overflow-x-hidden focus:outline-none"
            >
              {children}
            </main>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
