"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

type DeleteResult =
  | { ok: true }
  | { ok: false; error: string }
  | void
  | undefined;

interface Props {
  id: string;
  label: string;
  onDelete: (id: string) => Promise<DeleteResult>;
}

export function RowDeleteButton({ id, label, onDelete }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    if (!confirm(`Delete "${label}"? This can't be undone.`)) return;
    startTransition(async () => {
      const result = await onDelete(id);
      if (result && typeof result === "object" && "ok" in result && !result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-label={`Delete ${label}`}
        className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-[oklch(var(--danger-raw)/0.1)] hover:text-[var(--danger)] disabled:opacity-50"
      >
        <Trash2 className="size-3.5" strokeWidth={1.75} />
      </button>
      {error ? (
        <p
          role="alert"
          className="absolute -bottom-6 right-0 whitespace-nowrap text-[10px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
