import { readFileSync } from "fs";
import { join } from "path";
import { PropertiesFileSchema } from "@/schemas";
import type { Property } from "@/schemas";

let cached: Property[] | null = null;

export function getProperties(): Property[] {
  if (cached) return cached;
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "data/properties.json"), "utf-8")
  );
  cached = PropertiesFileSchema.parse(raw);
  return cached;
}
