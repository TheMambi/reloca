"use client";

import {
  useOptimistic,
  startTransition,
  useState,
  useTransition,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  CalendarDays,
  AlertTriangle,
  FileText,
  Pencil,
  Trash2,
  Plus,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChecklistItem, ChecklistCategory, ChecklistPhase } from "@/schemas";
import {
  toggleChecklistItem,
  deleteChecklistItem,
  reorderChecklistItem,
} from "@/app/checklist/actions";
import { settle } from "@/lib/settle-action";
import {
  reorderItems,
  applyMove,
  type Move,
  containerId,
  SORTABLE_PHASES,
} from "@/lib/checklist/reorder";
import { ChecklistTaskDialog } from "./checklist-task-dialog";

const PHASE_CONFIG: Record<
  ChecklistCategory,
  { label: string; icon: React.ReactNode; color: string; timeLabel: string }
> = {
  lease: {
    label: "Lease & Move-Out",
    icon: <FileText className="size-4" strokeWidth={1.75} />,
    color: "text-[var(--brand-secondary)]",
    timeLabel: "LSE",
  },
  "pre-move": {
    label: "Pre-Move",
    icon: <CalendarDays className="size-4" strokeWidth={1.75} />,
    color: "text-[var(--info)]",
    timeLabel: "PRE",
  },
  "move-week": {
    label: "Move Week",
    icon: <AlertTriangle className="size-4" strokeWidth={1.75} />,
    color: "text-[var(--warn)]",
    timeLabel: "T-7",
  },
  "post-move": {
    label: "Post-Move",
    icon: <CheckCircle2 className="size-4" strokeWidth={1.75} />,
    color: "text-[var(--ok)]",
    timeLabel: "T+",
  },
};

// Pre-Move comes first because it's where the user spends the most time
// (planning lives here weeks-to-months out from move day). Lease & Move-Out
// follows because lease deadlines live in their own dedicated /lease tracker;
// the checklist row is a secondary surface.
const PHASE_ORDER: ChecklistCategory[] = [
  "pre-move",
  "lease",
  "move-week",
  "post-move",
];

function isStatutory(item: ChecklistItem): boolean {
  return item.description?.toUpperCase().includes("STATUTORY") ?? false;
}

// Discriminated union so a single useOptimistic hook handles toggle and
// delete. Reorder uses local state (setLocalItems) directly because drag
// isn't a transition — it's intermediate visual state.
type OptimisticAction =
  | { kind: "toggle"; id: string; completed: boolean }
  | { kind: "delete"; id: string };

export function ChecklistList({ items }: { items: ChecklistItem[] }) {
  // Mirror the server-rendered prop locally so drag-during-drag can mutate
  // the visible order. When the prop changes after a server action's
  // revalidatePath fires, sync back to truth.
  const [localItems, setLocalItems] = useState(items);
  // Moves sent but not yet answered. Rows from the server can arrive while a
  // later move is still being saved; replaying the unanswered moves on top
  // keeps that row from jumping back and forth.
  const pendingMoves = useRef<Move[]>([]);
  const serverItems = useRef(items);
  useEffect(() => {
    serverItems.current = items;
    setLocalItems(pendingMoves.current.reduce(applyMove, items));
  }, [items]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();

  const [optimisticItems, applyOptimistic] = useOptimistic(
    localItems,
    (state, action: OptimisticAction) => {
      switch (action.kind) {
        case "toggle":
          return state.map((i) =>
            i.id === action.id ? { ...i, completed: action.completed } : i,
          );
        case "delete":
          return state.filter((i) => i.id !== action.id);
      }
    },
  );

  const [dialogState, setDialogState] = useState<
    | { open: false }
    | {
        open: true;
        mode: "create" | "edit";
        category: ChecklistPhase;
        initial?: Partial<ChecklistItem>;
        itemId?: string;
      }
  >({ open: false });

  const [confirmDelete, setConfirmDelete] = useState<ChecklistItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require a small drag distance before activating so that clicks on
      // the toggle / edit / delete buttons inside a row don't get hijacked
      // by an accidental dragstart.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleToggle = (id: string, current: boolean) => {
    const next = !current;
    setSaveError(null);
    startTransition(async () => {
      applyOptimistic({ kind: "toggle", id, completed: next });
      const res = await settle(toggleChecklistItem({ id, completed: next }));
      if (!res.ok) setSaveError("That tick wasn't saved. Try again.");
    });
  };

  const handleEdit = (item: ChecklistItem) => {
    if (item.category === "lease") return;
    setDialogState({
      open: true,
      mode: "edit",
      category: item.category,
      itemId: item.id,
      initial: {
        title: item.title,
        description: item.description,
        due_date: item.due_date,
      },
    });
  };

  const handleAdd = (category: ChecklistPhase) => {
    setDialogState({ open: true, mode: "create", category });
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setDeleteError(null);
    startDeleteTransition(async () => {
      startTransition(() => {
        applyOptimistic({ kind: "delete", id });
      });
      const res = await settle(deleteChecklistItem(id));
      if (res.ok) setConfirmDelete(null);
      else setDeleteError(res.error);
    });
  };

  // Drag-end: compute the post-move state (pure, see lib/checklist/reorder),
  // optimistically render it, then call the reorder RPC with just the moved
  // row's new (category, index). The RPC shifts neighbours transient-safely in
  // one transaction (migration 0024).
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;

    const result = reorderItems(localItems, String(active.id), String(over.id));
    if (!result) return;

    const move = result.moved;
    pendingMoves.current = [...pendingMoves.current, move];
    setLocalItems(result.items);
    setSaveError(null);
    const done = () => {
      pendingMoves.current = pendingMoves.current.filter((m) => m !== move);
    };
    void settle(
      reorderChecklistItem({
        id: move.id,
        targetCategory: move.category,
        targetIndex: move.order_index,
      }),
    ).then((res) => {
      done();
      if (res.ok) return;
      // Show what the server has, plus any later move still being saved, and
      // ask for fresh rows. An older snapshot would undo those later moves.
      setLocalItems(pendingMoves.current.reduce(applyMove, serverItems.current));
      setSaveError("That move wasn't saved. The list is back in its saved order. Try again.");
      router.refresh();
    });
  }

  const total = optimisticItems.length;
  const done = optimisticItems.filter((i) => i.completed).length;
  const overallPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const grouped = useMemo(() => {
    const acc: Record<ChecklistCategory, ChecklistItem[]> = {
      lease: [],
      "pre-move": [],
      "move-week": [],
      "post-move": [],
    };
    for (const item of optimisticItems) {
      acc[item.category].push(item);
    }
    return acc;
  }, [optimisticItems]);

  return (
    <div className="flex flex-col gap-6">
      {/* Overall progress */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <span className="label-cap text-[10px] text-muted-foreground">
            OVERALL PROGRESS
          </span>
          <span className="mono-num text-xs text-muted-foreground">
            {done} / {total}
          </span>
        </div>
        <Progress
          value={overallPct}
          aria-label="Overall checklist completion"
          className="mt-3 h-2"
        />
        <p className="mt-2 text-[10px] text-muted-foreground">
          {overallPct}% complete · saved automatically
        </p>
      </div>

      {saveError && (
        <p
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-3 py-2 text-xs text-[var(--danger)]"
        >
          {saveError}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col gap-4">
          {PHASE_ORDER.map((phase) => {
            const phaseItems = grouped[phase] ?? [];
            if (phaseItems.length === 0 && phase === "lease") return null;
            const config = PHASE_CONFIG[phase];
            const phaseDone = phaseItems.filter((i) => i.completed).length;
            const phasePct =
              phaseItems.length > 0
                ? Math.round((phaseDone / phaseItems.length) * 100)
                : 0;
            const isLease = phase === "lease";
            const sortable = SORTABLE_PHASES.has(phase);

            return (
              <section
                key={phase}
                id={isLease ? "lease-group" : undefined}
                className="rounded-[var(--radius-lg)] border border-border bg-card"
              >
                {/* Phase header */}
                <div className="flex items-center gap-3 border-b border-border px-6 py-3">
                  <span className={config.color}>{config.icon}</span>
                  <span className="text-sm font-semibold text-foreground">
                    {config.label}
                  </span>
                  <Badge variant="outline" className="ml-auto text-[9px]">
                    {config.timeLabel}
                  </Badge>
                  <span className="mono-num text-xs text-muted-foreground">
                    {phaseDone} / {phaseItems.length}
                  </span>
                </div>

                {/* Phase progress bar */}
                <div className="px-6 pt-3">
                  <Progress
                    value={phasePct}
                    aria-label={`${config.label} progress`}
                    className="h-1"
                  />
                </div>

                {sortable ? (
                  <SortableGroup
                    phase={phase}
                    items={phaseItems}
                    onToggle={handleToggle}
                    onEdit={handleEdit}
                    onDelete={(item) => {
                      setDeleteError(null);
                      setConfirmDelete(item);
                    }}
                  />
                ) : (
                  <ul className="divide-y divide-border/50">
                    {phaseItems.map((item) => (
                      <li key={item.id}>
                        <ChecklistRow
                          item={item}
                          isLease
                          statutory={isStatutory(item)}
                          onToggle={() => handleToggle(item.id, item.completed)}
                          onEdit={() => handleEdit(item)}
                          onDelete={() => {
                            setDeleteError(null);
                            setConfirmDelete(item);
                          }}
                          dragHandle={null}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                {/* "+ Add task" — non-lease only */}
                {!isLease && (
                  <div className="border-t border-border/50 px-6 py-2">
                    <button
                      type="button"
                      onClick={() => handleAdd(phase)}
                      className="label-cap inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-border/60 px-3 py-2 text-[10px] tracking-wider text-muted-foreground transition-colors hover:border-border hover:bg-accent/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Plus className="size-3" strokeWidth={1.75} />
                      ADD TASK
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </DndContext>

      {/* Add/Edit dialog */}
      {dialogState.open && (
        <ChecklistTaskDialog
          open={dialogState.open}
          onOpenChange={(o) => {
            if (!o) setDialogState({ open: false });
          }}
          mode={dialogState.mode}
          category={dialogState.category}
          initial={dialogState.initial}
          itemId={dialogState.itemId}
        />
      )}

      {/* Delete-confirm dialog */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this task?</DialogTitle>
            <DialogDescription>
              This can&rsquo;t be undone. The row will be removed from your
              checklist immediately.
            </DialogDescription>
          </DialogHeader>
          {confirmDelete && (
            <p className="rounded-[var(--radius-sm)] border border-border/60 bg-background/40 px-3 py-2 text-xs text-foreground">
              {confirmDelete.title}
            </p>
          )}
          {deleteError && (
            <p
              role="alert"
              className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-3 py-2 text-xs text-[var(--danger)]"
            >
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmDelete(null);
                setDeleteError(null);
              }}
              disabled={isDeletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeletePending}
              className="bg-[var(--danger)] text-white hover:bg-[oklch(var(--danger-raw)/0.9)]"
            >
              {isDeletePending ? "Deleting…" : "Delete task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Per-phase wrapper: a SortableContext for in-list reorders + a useDroppable
// container so an empty group can still receive a drop from another phase.
function SortableGroup({
  phase,
  items,
  onToggle,
  onEdit,
  onDelete,
}: {
  phase: ChecklistCategory;
  items: ChecklistItem[];
  onToggle: (id: string, completed: boolean) => void;
  onEdit: (item: ChecklistItem) => void;
  onDelete: (item: ChecklistItem) => void;
}) {
  const ids = items.map((i) => i.id);
  const { setNodeRef } = useDroppable({ id: containerId(phase) });

  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <ul ref={setNodeRef} className="divide-y divide-border/50 min-h-2">
        {items.map((item) => (
          <SortableRow
            key={item.id}
            item={item}
            onToggle={() => onToggle(item.id, item.completed)}
            onEdit={() => onEdit(item)}
            onDelete={() => onDelete(item)}
          />
        ))}
      </ul>
    </SortableContext>
  );
}

function SortableRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  const dragHandle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder "${item.title}"`}
      // touch-none: keep the PointerSensor drag from being stolen by the
      // browser's scroll/zoom gesture on trackpad + touch.
      className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-[var(--radius-sm)] text-muted-foreground/70 transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
    >
      <GripVertical className="size-3.5" strokeWidth={1.75} />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={isDragging ? "bg-accent/30 opacity-80 shadow" : undefined}
    >
      <ChecklistRow
        item={item}
        isLease={false}
        statutory={isStatutory(item)}
        onToggle={onToggle}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandle={dragHandle}
      />
    </li>
  );
}

function ChecklistRow({
  item,
  isLease,
  statutory,
  onToggle,
  onEdit,
  onDelete,
  dragHandle,
}: {
  item: ChecklistItem;
  isLease: boolean;
  statutory: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dragHandle: React.ReactNode;
}) {
  return (
    <div className="group relative flex items-start gap-3 px-6 py-3 transition-colors hover:bg-accent/20 focus-within:bg-accent/20">
      {/* Drag handle, only when sortable. Always visible (muted at rest, see
          the grip's text-muted-foreground/70) so the reorder affordance is
          discoverable — hover-only was invisible and read as "drag is broken".
          Lease rows render `dragHandle = null`. */}
      {dragHandle && <div className="mt-0.5 shrink-0">{dragHandle}</div>}

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={item.completed}
        aria-label={
          item.completed
            ? `Mark "${item.title}" incomplete`
            : `Mark "${item.title}" complete`
        }
        className="flex flex-1 items-start gap-3 text-left focus-visible:outline-none"
      >
        {item.completed ? (
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-[var(--ok)]"
            strokeWidth={1.75}
          />
        ) : (
          <Circle
            className="mt-0.5 size-4 shrink-0 text-border transition-colors group-hover:text-foreground/60"
            strokeWidth={1.75}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm transition-colors ${
                item.completed
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              }`}
            >
              {item.title}
            </span>
            {statutory && (
              <Badge
                variant="destructive"
                className="text-[8px] px-1.5 py-0 h-4"
              >
                STATUTORY
              </Badge>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          )}
        </div>
        <span className="mono-num shrink-0 text-[10px] text-muted-foreground">
          {item.due_date
            ? new Date(`${item.due_date}T00:00:00.000Z`).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", timeZone: "UTC" },
              )
            : "—"}
        </span>
      </button>

      {/* Hover affordances — non-lease only. Lease rows are managed by the
          seedLeaseChecklistTasks pipeline; making them editable here would
          drift from that source of truth. */}
      {/* Visible at rest below md — touch devices have no hover, so
          hover-only actions were unreachable there (Wave 5, AD-043). */}
      {!isLease && (
        <div className="flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 max-md:opacity-60 md:opacity-0 md:group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit "${item.title}"`}
            className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Pencil className="size-3" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete "${item.title}"`}
            className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-[oklch(var(--danger-raw)/0.12)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Trash2 className="size-3" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}
