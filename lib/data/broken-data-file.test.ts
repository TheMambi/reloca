// Run: npx tsx lib/data/broken-data-file.test.ts
//
// A city with no crime or climate file shows blanks in the compare tables. A
// file that is there but broken must stop the page, not look like missing data.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Relocation } from "@/schemas";

// The loaders read data/ under the working directory. This copy links to the
// real files, except one crime file that is broken and one climate file that
// is left out.
const real = join(process.cwd(), "data");
const root = mkdtempSync(join(tmpdir(), "reloca-data-"));
const copy = join(root, "data");
mkdirSync(copy);
for (const entry of readdirSync(real)) {
  if (entry === "crime" || entry === "climate") {
    mkdirSync(join(copy, entry));
    for (const file of readdirSync(join(real, entry))) {
      if (entry === "crime" && file === "sacramento.json") writeFileSync(join(copy, entry, file), '{"city":"sacramento"}');
      else if (entry === "climate" && file === "long-beach.json") continue;
      else symlinkSync(join(real, entry, file), join(copy, entry, file));
    }
  } else symlinkSync(join(real, entry), join(copy, entry));
}

const move = (destination_slug: string): Relocation => ({
  id: "00000000-0000-4000-8000-000000000000",
  user_id: "11111111-1111-4111-8111-111111111111",
  label: "Test move",
  origin_slug: "denver",
  destination_slug,
  move_date: null,
  is_active_move: true,
  created_at: "2026-05-30T00:00:00+00:00",
  updated_at: "2026-05-30T00:00:00+00:00",
});

async function main() {
  process.chdir(root);
  try {
    const { buildRelocationCompareColumns } = await import("./relocation-compare");
    const { getClimateProfile } = await import("./climate");
    const { MissingCityDataError } = await import("./missing-city-data");

    // Missing file: a blank, and the rest of the column still resolves.
    const [column] = buildRelocationCompareColumns([move("long-beach")]);
    assert.equal(column.floodTier, null);
    assert.notEqual(column.violentPer1k, null);
    assert.throws(() => getClimateProfile("long-beach"), MissingCityDataError);

    // Broken file: an error that is not the missing-file one.
    assert.throws(
      () => buildRelocationCompareColumns([move("sacramento")]),
      (err) => !(err instanceof MissingCityDataError),
    );
  } finally {
    process.chdir(join(real, ".."));
    rmSync(root, { recursive: true, force: true });
  }
  console.log("lib/data/broken-data-file.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
