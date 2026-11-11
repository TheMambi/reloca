import type { ReactNode } from "react";
import {
  type LifecycleConfig,
  LIFECYCLE_TONE_CLASSES,
} from "@/lib/lifecycle/types";
import { RowDeleteButton } from "./row-delete-button";

type DeleteResult =
  | { ok: true }
  | { ok: false; error: string }
  | void
  | undefined;

interface Props<TRow, TStatus extends string> {
  rows: TRow[];
  config: LifecycleConfig<TRow, TStatus>;
  onAdd: ReactNode;
  renderEdit: (row: TRow) => ReactNode;
  onDelete: (id: string) => Promise<DeleteResult>;
  emptyHint: string;
}

export function LifecycleTracker<TRow, TStatus extends string>({
  rows,
  config,
  onAdd,
  renderEdit,
  onDelete,
  emptyHint,
}: Props<TRow, TStatus>) {
  const active: TRow[] = [];
  const skipped: TRow[] = [];
  for (const row of rows) {
    if ((config.status(row) as string) === "skipped") skipped.push(row);
    else active.push(row);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Always-visible catalog row (empty state and populated state both want it) */}
      <div className="rounded-[var(--radius-md)] border border-border bg-card/60 p-4">
        {onAdd}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-background/30 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            Nothing tracked yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((row) => (
            <RowCard
              key={config.rowKey(row)}
              row={row}
              config={config}
              renderEdit={renderEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      {skipped.length > 0 ? (
        <details className="rounded-[var(--radius-md)] border border-border bg-card/40">
          <summary className="label-cap cursor-pointer px-4 py-2.5 text-[10px] tracking-wider text-muted-foreground">
            Skipped · {skipped.length}
          </summary>
          <ul className="flex flex-col gap-2 border-t border-border p-3">
            {skipped.map((row) => (
              <RowCard
                key={config.rowKey(row)}
                row={row}
                config={config}
                renderEdit={renderEdit}
                onDelete={onDelete}
                muted
              />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function RowCard<TRow, TStatus extends string>({
  row,
  config,
  renderEdit,
  onDelete,
  muted = false,
}: {
  row: TRow;
  config: LifecycleConfig<TRow, TStatus>;
  renderEdit: (row: TRow) => ReactNode;
  onDelete: (id: string) => Promise<DeleteResult>;
  muted?: boolean;
}) {
  const id = config.rowKey(row);
  const status = config.status(row);
  const tone = config.statusTone[status];
  const label = config.statusLabels[status];
  const date = config.dateLabel(row);
  const primary = config.primaryLabel(row);
  const meta = config.metadataLabel(row);

  return (
    <li
      className={`group relative flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-card/80 px-4 py-3 transition-colors hover:bg-card ${muted ? "opacity-70" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{primary}</span>
          <span
            className={`label-cap inline-flex items-center rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[10px] tracking-wider ${LIFECYCLE_TONE_CLASSES[tone]}`}
          >
            {label}
          </span>
        </div>
        {meta ? (
          <p className="mt-1 text-xs text-muted-foreground truncate">{meta}</p>
        ) : null}
        {date ? (
          <p className="mt-1 mono-num text-[11px] text-muted-foreground">
            {date}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {renderEdit(row)}
        <RowDeleteButton id={id} label={primary} onDelete={onDelete} />
      </div>
    </li>
  );
}
