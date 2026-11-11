"use client";

import { useEffect, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const STORAGE_KEY = "reloca:sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  // Server always renders expanded; client reconciles from localStorage in
  // the effect below. The brief flash on first paint when starting collapsed
  // is an acceptable trade for avoiding a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // localStorage unavailable (private mode, etc.) — fall through to default.
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // see above
      }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "relative hidden h-[calc(100svh-3rem)] shrink-0 flex-col gap-4 border-r border-border bg-sidebar transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-16 px-2 py-4" : "w-64 p-4",
      )}
      aria-label="Primary"
    >
      {/* Brand */}
      <Link
        href="/"
        aria-label="Reloca — go to dashboard"
        className={cn(
          "flex items-center gap-2.5 py-1",
          collapsed ? "justify-center" : "px-2",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--brand-secondary)]/14">
          <RelocaMark className="size-5 text-[var(--brand-secondary)]" />
        </span>
        {!collapsed && (
          <span className="text-lg font-semibold tracking-[var(--tracking-headline)] text-foreground">
            Reloca
          </span>
        )}
      </Link>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto pt-2">
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
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-[var(--radius-md)] text-sm transition-colors",
                collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
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
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle — sits half-overhanging the right edge so it's
          findable but doesn't crowd the nav rail. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-20 grid size-6 place-items-center rounded-[var(--radius-sm)] border border-border bg-sidebar text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {collapsed ? (
          <ChevronRight className="size-3.5" strokeWidth={1.75} />
        ) : (
          <ChevronLeft className="size-3.5" strokeWidth={1.75} />
        )}
      </button>
    </aside>
  );
}

/* RelocaMark — bespoke brand mark. Stylized house silhouette with a curved
   roofline, in coral. Reads as "home / movement" — distinctive and warm,
   without invoking the literal heart that AD-004 bans. */
function RelocaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path
        d="M 4 12 Q 4 7 8.5 7 Q 12 7 12 11 Q 12 7 15.5 7 Q 20 7 20 12 L 20 19 Q 20 20 19 20 L 5 20 Q 4 20 4 19 Z"
        fill="currentColor"
        fillOpacity="0.9"
        strokeWidth="1.4"
      />
      <path
        d="M 10 20 L 10 14 Q 10 13 11 13 L 13 13 Q 14 13 14 14 L 14 20"
        stroke="var(--sidebar)"
        strokeWidth="1.4"
        fill="none"
      />
    </svg>
  );
}
