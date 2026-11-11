import { ClipboardCheck } from "lucide-react";
import { getActiveWalkthroughWithRooms } from "@/lib/data/move-out-db";
import { BeginWalkthroughButton } from "./begin-walkthrough-button";
import { WalkthroughForm } from "./walkthrough-form";

// Embedded section on /lease. Renders the "Begin walkthrough" button when
// nothing's started, or the walkthrough form when one exists.
//
// `id="move-out"` is the anchor target for the dashboard's MOVE-OUT
// WALKTHROUGH tile (Task 7.29 — Open → /lease#move-out).
export async function DepositSection() {
  const { walkthrough, rooms } = await getActiveWalkthroughWithRooms();

  return (
    <section
      id="move-out"
      className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-6"
    >
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--info)]/14 text-[var(--info)]">
          <ClipboardCheck className="size-5" strokeWidth={1.75} />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-semibold tracking-[var(--tracking-headline)] text-foreground">
            Move-out walkthrough
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Document the unit&rsquo;s condition before you hand back the keys.
            Generates a PDF you can send your landlord and keep for records.
          </p>
        </div>
      </header>

      {walkthrough ? (
        <WalkthroughForm walkthrough={walkthrough} rooms={rooms} />
      ) : (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-background/30 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            Not started yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            We&rsquo;ll seed it with the four usual rooms (Living room, Kitchen,
            Bedroom, Bathroom). You can add or remove any of them.
          </p>
          <div className="mt-4 flex justify-center">
            <BeginWalkthroughButton />
          </div>
        </div>
      )}
    </section>
  );
}
