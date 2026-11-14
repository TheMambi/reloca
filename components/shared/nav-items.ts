import {
  LayoutGrid,
  DollarSign,
  Building2,
  FileSignature,
  ArrowLeftRight,
  Calculator,
  Users,
  CheckSquare,
} from "lucide-react";

// The app's pages, in menu order. The sidebar and the phone drawer both read
// this list, so a new page shows up in both.
export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/cost-of-living", label: "Cost & Commute", icon: DollarSign },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/lease", label: "Lease", icon: FileSignature },
  { href: "/transitions", label: "Transitions", icon: ArrowLeftRight },
  { href: "/moving-cost", label: "Moving cost", icon: Calculator },
  { href: "/checklist", label: "Checklist", icon: CheckSquare },
  { href: "/community", label: "Community", icon: Users },
] as const;
