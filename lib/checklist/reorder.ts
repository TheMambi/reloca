// Pure drag-reorder math for the checklist (Wave E.2). Extracted from the
// client component so handleDragEnd stays thin AND the index arithmetic is
// unit-testable under tsx without pulling in React / dnd-kit / server actions.

import type { ChecklistItem, ChecklistCategory } from "@/schemas";

// dnd-kit droppable id for an (empty-or-not) phase container, so a drop on a
// phase with no item still resolves to that category.
const CONTAINER_PREFIX = "container:";

export function containerId(cat: ChecklistCategory): string {
  return `${CONTAINER_PREFIX}${cat}`;
}

export function categoryFromContainer(id: string): ChecklistCategory | null {
  if (!id.startsWith(CONTAINER_PREFIX)) return null;
  return id.slice(CONTAINER_PREFIX.length) as ChecklistCategory;
}

// Lease rows are managed by seedLeaseChecklistTasks and never reorder.
export const SORTABLE_PHASES = new Set<ChecklistCategory>([
  "pre-move",
  "move-week",
  "post-move",
]);

export type ReorderResult = {
  /** The full item list with order_index renumbered densely per category. */
  items: ChecklistItem[];
  /** The moved row's new home — what the reorder RPC needs. */
  moved: { id: string; category: ChecklistCategory; order_index: number };
};

/**
 * Compute the post-drag state from a dnd-kit (active, over) pair. Returns the
 * renumbered list + the moved row's new (category, order_index), or null when
 * the drag is a no-op or not allowed (lease rows, unknown drop target).
 *
 * `overId` is either another item's id (drop relative to it) or a
 * `container:<category>` droppable (drop at the end of that category).
 */
export function reorderItems(
  items: ChecklistItem[],
  activeId: string,
  overId: string,
): ReorderResult | null {
  if (activeId === overId) return null;

  const activeItem = items.find((i) => i.id === activeId);
  if (!activeItem || activeItem.category === "lease") return null;

  const overItem = items.find((i) => i.id === overId);
  let targetCategory: ChecklistCategory;
  if (overItem) {
    if (overItem.category === "lease") return null;
    targetCategory = overItem.category;
  } else {
    const fromContainer = categoryFromContainer(overId);
    if (!fromContainer || !SORTABLE_PHASES.has(fromContainer)) return null;
    targetCategory = fromContainer;
  }

  // Strip the active row, splice it back at the drop point, renumber per category.
  const without = items.filter((i) => i.id !== activeId);
  let insertAt: number;
  if (overItem) {
    insertAt = without.findIndex((i) => i.id === overId);
    if (insertAt === -1) insertAt = without.length;
    // Same-category downward drag: drop AFTER the target so the committed order
    // matches dnd-kit's arrayMove drag preview (otherwise the row visibly jumps
    // one slot up on release). Cross-category + upward drops insert before it.
    else if (
      overItem.category === activeItem.category &&
      activeItem.order_index < overItem.order_index
    ) {
      insertAt += 1;
    }
  } else {
    let lastIdxOfCat = -1;
    for (let i = 0; i < without.length; i++) {
      if (without[i].category === targetCategory) lastIdxOfCat = i;
    }
    insertAt = lastIdxOfCat + 1;
  }

  const reinserted = [...without];
  reinserted.splice(insertAt, 0, { ...activeItem, category: targetCategory });

  const perCategoryCounter: Partial<Record<ChecklistCategory, number>> = {};
  const renumbered = reinserted.map((item) => {
    const idx = perCategoryCounter[item.category] ?? 0;
    perCategoryCounter[item.category] = idx + 1;
    return { ...item, order_index: idx };
  });

  const movedRow = renumbered.find((i) => i.id === activeId);
  if (!movedRow) return null;
  if (
    movedRow.category === activeItem.category &&
    movedRow.order_index === activeItem.order_index
  ) {
    return null; // landed in the same spot — no-op
  }

  return {
    items: renumbered,
    moved: {
      id: activeId,
      category: movedRow.category,
      order_index: movedRow.order_index,
    },
  };
}
