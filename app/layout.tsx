import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/shared/sidebar";
import { StatusRow } from "@/components/shared/status-row";
import { DemoBanner } from "@/components/shared/demo-banner";
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
  title: {
    default: "Reloca — your relocation cockpit",
    template: "%s · Reloca",
  },
  description:
    "A personal relocation dashboard: cost of living, properties, community, checklist, lease — everything for the move in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TooltipProvider delayDuration={150}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-md)] focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-sm"
          >
            Skip to content
          </a>
          <DemoBanner />
          <StatusRow />
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
