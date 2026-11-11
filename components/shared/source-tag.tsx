// Provenance tags (Phase 8 Wave C, C.6 · AD-031). A muted, color-neutral,
// off-chrome line that discloses where a number came from and how trustworthy
// it is: "Source: <label> · <tier> · fetched <Mon YYYY>". Resolves the id
// against data/data-sources.json; renders nothing for an unknown/absent id
// (graceful degradation — a missing source never crashes a surface).

import { getDataSource } from "@/lib/data/data-sources";

const TIER_LABELS: Record<string, string> = {
  live: "Live",
  modeled: "Modeled",
  community: "Community",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatFetched(iso: string): string {
  const [y, m] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} ${y}` : y;
}

/** A single provenance line for one source id. */
export function SourceTag({
  id,
  className = "",
}: {
  id: string | undefined | null;
  className?: string;
}) {
  if (!id) return null;
  const src = getDataSource(id);
  if (!src) return null;
  const tier = TIER_LABELS[src.tier] ?? src.tier;
  return (
    <p
      className={`text-[10px] leading-snug text-muted-foreground ${className}`}
      title={src.notes ? `${src.provider} — ${src.notes}` : src.provider}
    >
      Source: {src.label} · {tier} · fetched {formatFetched(src.fetchedAt)}
    </p>
  );
}

/** Several provenance lines, de-duplicated, for a surface using multiple sources. */
export function SourceTagList({
  ids,
  className = "",
}: {
  ids: (string | undefined | null)[];
  className?: string;
}) {
  const seen = new Set<string>();
  const unique = ids.filter(
    (id): id is string => Boolean(id) && !seen.has(id!) && (seen.add(id!), true),
  );
  if (unique.length === 0) return null;
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {unique.map((id) => (
        <SourceTag key={id} id={id} />
      ))}
    </div>
  );
}
