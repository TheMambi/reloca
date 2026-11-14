import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-muted">
        <Compass className="size-5 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <h1 className="text-lg font-semibold tracking-[var(--tracking-headline)]">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        There is nothing at this address. Check the link, or head back to the
        dashboard.
      </p>
      <Button asChild>
        <Link href="/">Go to the dashboard</Link>
      </Button>
    </div>
  );
}
