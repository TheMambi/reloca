"use client";

import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

/**
 * Tabs whose open tab is the `?tab=` value in the address. A plain Tabs reads
 * its starting tab once, so a link that only changes the query string, or a
 * new set of tabs after switching relocation, left the old tab (or none) in
 * front. Here the address decides, and a tab that no longer exists falls back
 * to `defaultValue`.
 */
export function UrlTabs({
  values,
  defaultValue,
  ...props
}: Omit<ComponentProps<typeof Tabs>, "value" | "defaultValue" | "onValueChange"> & {
  values: string[];
  defaultValue: string;
}) {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("tab");
  const value = fromUrl !== null && values.includes(fromUrl) ? fromUrl : defaultValue;

  function onValueChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    // Changing the address this way updates useSearchParams without asking the
    // server for the page again.
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  return <Tabs value={value} onValueChange={onValueChange} {...props} />;
}
