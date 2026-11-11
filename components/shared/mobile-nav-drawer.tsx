"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  DollarSign,
  Building2,
  FileSignature,
  ArrowLeftRight,
  Calculator,
  Users,
  CheckSquare,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/cost-of-living", label: "Cost & Commute", icon: DollarSign },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/lease", label: "Lease", icon: FileSignature },
  { href: "/transitions", label: "Transitions", icon: ArrowLeftRight },
  { href: "/moving-cost", label: "Moving cost", icon: Calculator },
  { href: "/checklist", label: "Checklist", icon: CheckSquare },
  { href: "/community", label: "Community", icon: Users },
] as const;

export function MobileNavDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation menu"
          className="grid size-8 place-items-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        >
          <Menu className="size-4" strokeWidth={1.75} />
        </button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="border-r border-border bg-sidebar p-0"
      >
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle className="text-base font-semibold tracking-[var(--tracking-headline)]">
            Reloca
          </SheetTitle>
        </SheetHeader>

        <nav
          aria-label="Primary"
          className="flex-1 space-y-1 overflow-y-auto p-3"
        >
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--brand)]/15 text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-[var(--brand)]" : "text-muted-foreground",
                  )}
                  strokeWidth={1.75}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
