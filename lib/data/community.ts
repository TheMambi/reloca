import { readFileSync } from "fs";
import { join } from "path";
import { CommunityInsightFileSchema } from "@/schemas";
import type { CityCommunity } from "@/schemas";

let cached: CityCommunity[] | null = null;

export function getCommunityInsights(): CityCommunity[] {
  if (cached) return cached;
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "data/community.json"), "utf-8")
  );
  cached = CommunityInsightFileSchema.parse(raw);
  return cached;
}
