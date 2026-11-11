import { isDemoMode } from "@/lib/supabase/server";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="border-b border-border bg-card px-4 py-1.5 text-center text-xs text-muted-foreground">
      Demo with sample data. Edits work but reset from time to time.{" "}
      <a
        href="https://github.com/TheMambi/reloca"
        className="text-foreground underline underline-offset-2"
      >
        See the code
      </a>
    </div>
  );
}
