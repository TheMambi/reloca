// Run: npx tsx --conditions=react-server lib/lease/walkthrough-limits.test.ts
//
// The walkthrough report is drawn on the server, so what goes into it is
// bounded: field lengths, the number of rooms, and how often it may be asked for.
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";

process.env.RELOCA_MODE = "demo";

const appRequire = createRequire(join(process.cwd(), "package.json"));
function standIn(specifier: string, exports: object) {
  const file = appRequire.resolve(specifier);
  const mod = new Module(file);
  mod.exports = exports;
  mod.loaded = true;
  appRequire.cache[file] = mod;
}
let caller = "203.0.113.7";
standIn("next/cache", { revalidatePath() {}, revalidateTag() {} });
standIn("next/server", { connection: async () => {} });
standIn("next/headers", {
  cookies: async () => ({ get: () => undefined, set() {}, delete() {} }),
  headers: async () => new Headers({ "x-forwarded-for": caller }),
});

async function main() {
  const moveOut = await import("@/app/lease/move-out-actions");
  const lease = await import("@/app/lease/actions");
  const { walkthrough, rooms } = await moveOut.createWalkthrough();

  // ---- field lengths ----
  await assert.rejects(moveOut.updateWalkthrough(walkthrough.id, { overall_notes: "n".repeat(400_000) }), "a 400 KB note is refused");
  await assert.rejects(moveOut.updateWalkthrough(walkthrough.id, { overall_notes: "n".repeat(2001) }));
  await moveOut.updateWalkthrough(walkthrough.id, { overall_notes: "n".repeat(2000) });
  for (const field of ["walls_status", "floors_status", "appliances_status", "fixtures_status", "notes"] as const) {
    await assert.rejects(moveOut.updateRoomRecord(rooms[0].id, { [field]: "n".repeat(2001) }), `${field} is capped`);
  }
  await assert.rejects(moveOut.updateRoomRecord(rooms[0].id, { room_name: "n".repeat(81) }));
  await assert.rejects(moveOut.addRoom(walkthrough.id, "n".repeat(81)));

  // ---- number of rooms ----
  for (let i = rooms.length; i < 30; i++) await moveOut.addRoom(walkthrough.id, `Room ${i}`);
  await assert.rejects(moveOut.addRoom(walkthrough.id, "One too many"), /up to 30 rooms/);

  // ---- the report refuses more text than it can draw quickly ----
  const all = (await moveOut.createWalkthrough()).rooms;
  for (const room of all.slice(0, 12)) await moveOut.updateRoomRecord(room.id, { notes: "word ".repeat(400) });
  const tooMuch = await moveOut.generateWalkthroughReport(walkthrough.id);
  assert.deepEqual(tooMuch, {
    ok: false,
    error: "This walkthrough has too much text for one report. Shorten the notes and try again.",
  });

  // ---- and it may only be asked for a few times a minute ----
  caller = "203.0.113.8";
  const outcomes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const r = await moveOut.generateWalkthroughReport(walkthrough.id);
    outcomes.push(r.ok ? "ok" : r.error);
  }
  assert.equal(outcomes.filter((o) => /a lot of reports/.test(o)).length, 3, "5 a minute, then refused");

  // ---- the link reader has the same kind of limit, before anything else runs ----
  caller = "203.0.113.9";
  const previews = [];
  for (let i = 0; i < 7; i++) previews.push(await lease.fetchDestinationPreview("https://example.test/"));
  assert.equal(previews.filter((p) => p.status === "fetch_failed" && /a lot of links/.test(p.message)).length, 2);

  console.log("lib/lease/walkthrough-limits.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
