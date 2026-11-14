"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronsUpDown,
  GitCompareArrows,
  Pencil,
  Plus,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setActiveMove, setViewingRelocation } from "@/app/relocations/actions";
import type { RelocationOption } from "@/lib/data/relocation-db";
import {
  RelocationManageDialog,
  type CityChoice,
} from "@/components/shared/relocation-manage-dialog";

type ManageState =
  | { kind: "create" }
  | { kind: "edit"; relocation: RelocationOption }
  | null;

export function RelocationSwitcher({
  options,
  activeId,
  viewingId,
  cities,
}: {
  options: RelocationOption[];
  activeId: string | null;
  /** What the pages show when the URL names no relocation (the saved choice, else the active move). */
  viewingId: string | null;
  cities: CityChoice[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState<ManageState>(null);
  const [pending, startTransition] = useTransition();
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const param = searchParams.get("relocation");
  const viewing =
    options.find((o) => o.id === param) ??
    options.find((o) => o.id === viewingId) ??
    options.find((o) => o.id === activeId) ??
    options[0] ??
    null;

  function selectViewing(id: string) {
    setOpen(false);
    startTransition(async () => {
      // Persist the choice so it survives plain sidebar/drawer navigation (the
      // links carry no `?relocation=`); clear it when the user picks the active
      // move so "active" stays the clean default. The param push below still
      // gives instant same-page reactivity and keeps the view deep-linkable.
      await setViewingRelocation(id === activeId ? null : id);
      const next = new URLSearchParams(searchParams.toString());
      if (id === activeId) {
        next.delete("relocation"); // active is the default — keep the URL clean
      } else {
        next.set("relocation", id);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
      router.refresh();
    });
  }

  function promote(id: string) {
    setPromoteError(null);
    startTransition(async () => {
      const res = await setActiveMove(id);
      if (!res.ok) setPromoteError(res.error);
      if (res.ok) {
        // The promoted relocation becomes the default — drop the explicit param.
        const next = new URLSearchParams(searchParams.toString());
        next.delete("relocation");
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
        router.refresh();
        setOpen(false);
      }
    });
  }

  if (!viewing) {
    // No relocations at all — offer to create the first one.
    return (
      <>
        <button
          type="button"
          onClick={() => setManage({ kind: "create" })}
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" />
          <span className="label-cap">Add relocation</span>
        </button>
        <RelocationManageDialog
          open={manage !== null}
          onOpenChange={(o) => !o && setManage(null)}
          mode={manage ?? { kind: "create" }}
          cities={cities}
        />
      </>
    );
  }

  const viewingIsActive = viewing.id === activeId;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-accent"
          >
            <span className="label-cap hidden text-[10px] text-muted-foreground sm:inline">
              ROUTE
            </span>
            <span className="mono-num text-foreground">
              {viewing.originCode}
            </span>
            <ArrowRight className="size-3 text-[var(--brand-secondary)]" />
            <span className="mono-num text-foreground">
              {viewing.destinationCode}
            </span>
            {!viewingIsActive && (
              <span className="label-cap rounded-[var(--radius-sm)] border border-border px-1 py-0.5 text-[8px] text-muted-foreground">
                Comparing
              </span>
            )}
            <ChevronsUpDown className="size-3 text-muted-foreground" />
            <span className="sr-only">
              Switch relocation, viewing {viewing.label}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-72 rounded-[var(--radius-md)] border-border bg-popover p-0"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="label-cap text-[10px] text-muted-foreground">
              Relocations
            </p>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {options.map((o) => {
              const isViewing = o.id === viewing.id;
              const isActive = o.id === activeId;
              return (
                <li key={o.id} className="flex items-center gap-1 px-1.5">
                  <button
                    type="button"
                    onClick={() => selectViewing(o.id)}
                    className="flex flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left hover:bg-accent"
                  >
                    <Check
                      className={`size-3.5 shrink-0 ${
                        isViewing ? "text-foreground" : "text-transparent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-foreground">
                        {o.label}
                      </span>
                      <span className="mono-num block text-[10px] text-muted-foreground">
                        {o.originCode} → {o.destinationCode}
                      </span>
                    </span>
                    {isActive && (
                      <span className="label-cap shrink-0 rounded-[var(--radius-sm)] border border-[var(--ok)]/40 px-1.5 py-0.5 text-[8px] text-[var(--ok)]">
                        Active move
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${o.label}`}
                    onClick={() => {
                      setOpen(false);
                      setManage({ kind: "edit", relocation: o });
                    }}
                    className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="size-3" />
                  </button>
                </li>
              );
            })}
          </ul>

          {!viewingIsActive && (
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                onClick={() => promote(viewing.id)}
                disabled={pending}
                className="w-full rounded-[var(--radius-sm)] border border-border bg-card px-2 py-1.5 text-xs text-foreground hover:bg-accent disabled:opacity-50"
              >
                {pending ? "Setting…" : "Set as active move"}
              </button>
              {promoteError && (
                <p role="alert" className="mt-1.5 text-[10px] leading-snug text-[var(--danger)]">
                  {promoteError}
                </p>
              )}
              <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                Your checklist, lease, and move tasks track the active move.
              </p>
            </div>
          )}

          <div className="border-t border-border px-1.5 py-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setManage({ kind: "create" });
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
              New relocation
            </button>
            <Link
              href="/properties?tab=compare&compareView=relocations"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <GitCompareArrows className="size-3.5" />
              Compare relocations
            </Link>
          </div>
        </PopoverContent>
      </Popover>

      <RelocationManageDialog
        open={manage !== null}
        onOpenChange={(o) => !o && setManage(null)}
        mode={manage ?? { kind: "create" }}
        cities={cities}
      />
    </>
  );
}
