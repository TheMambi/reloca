"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateScenarioLineItems } from "@/app/moving-cost/actions";
import type { LineItem, Scenario } from "@/schemas/move-cost";
import { formatCurrency } from "@/lib/moving-cost/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: Scenario;
}

export function LineItemsEditor({ open, onOpenChange, scenario }: Props) {
  const [items, setItems] = useState<LineItem[]>(scenario.line_items);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patchItem(idx: number, next: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...next } : item)),
    );
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: "",
        cost: 0,
      },
    ]);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // Strip empty-name rows so the schema's `min(1)` doesn't reject the write.
    const cleaned = items
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        cost: Number.isFinite(item.cost) ? Math.max(item.cost, 0) : 0,
      }))
      .filter((item) => item.name !== "");

    startTransition(async () => {
      const result = await updateScenarioLineItems(scenario.id, cleaned);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Reset to the props-provided list each time the dialog closes so
      // reopening it shows the freshly-saved server state.
      setItems(scenario.line_items);
      setError(null);
    }
    onOpenChange(next);
  }

  const total = items.reduce((sum, i) => sum + (Number.isFinite(i.cost) ? i.cost : 0), 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit costs · {scenario.label}</DialogTitle>
          <DialogDescription>
            Adjust each amount. The total updates as you type.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <ul className="flex flex-col gap-2">
            {items.map((item, idx) => (
              <li
                key={item.id}
                className="grid grid-cols-[1fr_120px_auto] items-center gap-2"
              >
                <Input
                  value={item.name}
                  onChange={(e) => patchItem(idx, { name: e.target.value })}
                  placeholder="What's this cost for?"
                  className="h-9 text-sm"
                />
                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <Input
                    inputMode="decimal"
                    value={Number.isFinite(item.cost) ? String(item.cost) : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const n = v.trim() === "" ? 0 : Number(v);
                      patchItem(idx, {
                        cost: Number.isFinite(n) && n >= 0 ? n : 0,
                      });
                    }}
                    className="h-9 pl-5 text-sm mono-num"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  aria-label={`Remove ${item.name || "this cost"}`}
                  className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-[oklch(var(--danger-raw)/0.1)] hover:text-[var(--danger)]"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            className="gap-1.5"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            Add a cost
          </Button>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="label-cap text-[10px] tracking-wider text-muted-foreground">
              TOTAL
            </span>
            <span className="mono-num text-base font-semibold text-foreground">
              {formatCurrency(total)}
            </span>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-2 py-1.5 text-[11px] text-[var(--danger)]"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save costs"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
