// What a screen reader hears while a task is dragged. dnd-kit's own text is
// built from item ids, which are UUIDs here, so every message is rebuilt from
// task titles and group names. Pure, so it is testable without React.

import type { ChecklistCategory, ChecklistItem } from "@/schemas";
import { categoryFromContainer } from "./reorder";

export function dragAnnouncements(
  items: ChecklistItem[],
  groupLabels: Record<ChecklistCategory, string>,
) {
  const find = (id: string) => items.find((i) => i.id === id);
  const task = (id: string) => {
    const item = find(id);
    return item ? `"${item.title}"` : "The task";
  };
  // A drop target is another task or a whole group (an empty one included).
  const place = (id: string) => {
    const group = categoryFromContainer(id);
    if (group) return `the ${groupLabels[group]} group`;
    const item = find(id);
    return item ? `"${item.title}" in ${groupLabels[item.category]}` : "the list";
  };

  return {
    start: (activeId: string) => `Picked up ${task(activeId)}.`,
    over: (activeId: string, overId: string | null) =>
      overId === null
        ? `${task(activeId)} is not over a place it can go.`
        : overId === activeId
          ? `${task(activeId)} is over its own place.`
          : `${task(activeId)} is over ${place(overId)}.`,
    end: (activeId: string, overId: string | null) =>
      overId === null || overId === activeId
        ? `${task(activeId)} was put back where it was.`
        : `${task(activeId)} was dropped at ${place(overId)}.`,
    cancel: (activeId: string) => `Moving ${task(activeId)} was cancelled. It is back where it was.`,
  };
}
