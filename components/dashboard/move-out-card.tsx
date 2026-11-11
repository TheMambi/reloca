import { ClipboardCheck } from "lucide-react";
import { ModuleCard, MetaCell } from "./operations-grid";
import { getActiveWalkthroughWithRooms } from "@/lib/data/move-out-db";

export async function MoveOutCard() {
  const { walkthrough, rooms } = await getActiveWalkthroughWithRooms();

  const baseProps = {
    href: "/lease?tab=walkthrough",
    icon: <ClipboardCheck className="size-5" strokeWidth={1.75} />,
    iconClass: "text-[var(--info)]",
    iconBg: "bg-[var(--info)]/14",
    code: "MOVE-OUT WALKTHROUGH",
    title: "Move-out walkthrough",
    description: "Document the unit before handback.",
    ctaLabel: "Open",
  };

  if (!walkthrough) {
    return (
      <ModuleCard
        {...baseProps}
        metaRow={
          <p className="text-xs text-muted-foreground italic">Not started</p>
        }
      />
    );
  }

  // A room counts as "documented" if it has either a condition rating, a
  // cleanliness rating, or any free-text status filled. Tracks the user's
  // forward progress without forcing them to fill every field.
  const documented = rooms.filter(
    (r) =>
      r.condition_rating !== null ||
      r.cleanliness_rating !== null ||
      r.walls_status ||
      r.floors_status ||
      r.appliances_status ||
      r.fixtures_status ||
      r.notes,
  ).length;

  const pdfStatus = walkthrough.pdf_generated_at ? "Ready" : "Pending";
  const pdfTone: "ok" | "muted" = walkthrough.pdf_generated_at
    ? "ok"
    : "muted";

  return (
    <ModuleCard
      {...baseProps}
      metaRow={
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MetaCell value={String(rooms.length)} label="Rooms" />
          <MetaCell
            value={`${documented}/${rooms.length}`}
            label="Documented"
            tone={documented > 0 ? "ok" : "muted"}
          />
          <MetaCell value={pdfStatus} label="PDF" tone={pdfTone} />
        </div>
      }
    />
  );
}
