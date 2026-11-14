import type { MetadataRoute } from "next";
import { appMode } from "@/lib/mode";
import { allowsIndexing } from "@/lib/security-headers";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: allowsIndexing(appMode()) ? { userAgent: "*", allow: "/" } : { userAgent: "*", disallow: "/" },
  };
}
