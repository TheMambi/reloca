"use client";

import { useEffect } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Button } from "@/components/ui/button";
import "./globals.css";

// Shown when the root layout itself fails, so it has to bring its own <html>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <title>Something went wrong · Reloca</title>
        <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-lg font-semibold tracking-[var(--tracking-headline)]">
            Reloca couldn&apos;t load
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Something went wrong before the page could be shown. Nothing was
            changed. Try again in a moment.
          </p>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </main>
      </body>
    </html>
  );
}
