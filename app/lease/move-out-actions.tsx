"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { ActionFailure, dbFailure, runAction, type ActionResult } from "@/lib/action-result";
import {
  MoveOutWalkthroughSchema,
  MoveOutRoomRecordSchema,
  RatingEnum,
  type MoveOutWalkthrough,
  type MoveOutRoomRecord,
} from "@/schemas/move-out";
import { getActiveLease } from "@/lib/data/lease-db";
import { todayInZoneIso } from "@/lib/dates";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
// NOTE: @react-pdf/renderer + the report template are imported dynamically
// inside generateWalkthroughReport (Wave 6, AD-044) — react-pdf is by far the
// heaviest dependency on this route and is only needed for the one-shot
// report generation, not for rendering /lease.


const DEFAULT_ROOMS = [
  "Living room",
  "Kitchen",
  "Bedroom",
  "Bathroom",
] as const;

// Idempotent. Returns the latest walkthrough for the user, or creates a new
// one + seeds the 4 default rooms (Living room / Kitchen / Bedroom / Bathroom)
// if none exists. Caller renders an inspection form against the result.
export async function createWalkthrough(): Promise<
  ActionResult<{ walkthrough: MoveOutWalkthrough; rooms: MoveOutRoomRecord[] }>
> {
  return runAction("createWalkthrough", async () => {
    const sb = await createClient();
    const userId = requireUserId();

    // Fast path: already started.
    const { data: existing, error: readErr } = await sb
      .from("move_out_walkthroughs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readErr) throw dbFailure("createWalkthrough.read", readErr);

    if (existing) {
      const walkthrough = MoveOutWalkthroughSchema.parse(existing);
      const { data: rooms, error: roomsErr } = await sb
        .from("move_out_room_records")
        .select("*")
        .eq("user_id", userId)
        .eq("walkthrough_id", walkthrough.id)
        .order("order_index", { ascending: true });
      if (roomsErr)
        throw dbFailure("createWalkthrough.readRooms", roomsErr);
      return {
        walkthrough,
        rooms: (rooms ?? []).map((r) => MoveOutRoomRecordSchema.parse(r)),
      };
    }

    // Create new walkthrough + seed default rooms.
    const { data: created, error: createErr } = await sb
      .from("move_out_walkthroughs")
      .insert({
        user_id: userId,
        walkthrough_date: todayInZoneIso(),
      })
      .select("*")
      .single();
    if (createErr)
      throw dbFailure("createWalkthrough.create", createErr);

    const walkthrough = MoveOutWalkthroughSchema.parse(created);

    const seedRows = DEFAULT_ROOMS.map((name, idx) => ({
      walkthrough_id: walkthrough.id,
      user_id: userId,
      room_name: name,
      order_index: idx,
    }));
    const { data: insertedRooms, error: seedErr } = await sb
      .from("move_out_room_records")
      .insert(seedRows)
      .select("*")
      .order("order_index", { ascending: true });
    if (seedErr)
      throw dbFailure("createWalkthrough.seedRooms", seedErr);

    const rooms = (insertedRooms ?? []).map((r) =>
      MoveOutRoomRecordSchema.parse(r),
    );

    revalidatePath("/lease");
    revalidatePath("/");
    return { walkthrough, rooms };
  });
}

export async function addRoom(
  walkthroughId: string,
  roomName: string,
): Promise<ActionResult<{ row: MoveOutRoomRecord }>> {
  return runAction("addRoom", async () => {
    z.uuid().parse(walkthroughId);
    const trimmed = z.string().parse(roomName).trim();
    if (trimmed.length === 0) throw new ActionFailure("Give the room a name.");
    if (trimmed.length > ROOM_NAME_MAX) throw new ActionFailure(`Keep the room name under ${ROOM_NAME_MAX} characters.`);

    const sb = await createClient();
    const userId = requireUserId();

    const { data: existingRooms, error: countErr } = await sb
      .from("move_out_room_records")
      .select("id")
      .eq("user_id", userId)
      .eq("walkthrough_id", walkthroughId);
    if (countErr) throw dbFailure("addRoom.count", countErr);
    if ((existingRooms?.length ?? 0) >= MAX_ROOMS) throw new ActionFailure(`A walkthrough holds up to ${MAX_ROOMS} rooms.`);

    // Compute order_index = max(existing) + 1 within this walkthrough.
    const { data: maxRow, error: maxErr } = await sb
      .from("move_out_room_records")
      .select("order_index")
      .eq("user_id", userId)
      .eq("walkthrough_id", walkthroughId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw dbFailure("addRoom.maxOrder", maxErr);
    const nextOrder = (maxRow?.order_index ?? -1) + 1;

    const { data, error } = await sb
      .from("move_out_room_records")
      .insert({
        walkthrough_id: walkthroughId,
        user_id: userId,
        room_name: trimmed,
        order_index: nextOrder,
      })
      .select("*")
      .single();
    if (error) throw dbFailure("addRoom.insert", error);

    revalidatePath("/lease");
    revalidatePath("/");
    return { row: MoveOutRoomRecordSchema.parse(data) };
  });
}

// The report is drawn on the server, and drawing time grows much faster than
// the text does (100 KB of notes took about 8 seconds and 750 MB). So each
// field has a ceiling, a walkthrough has a room limit, and the report refuses
// a walkthrough whose text adds up past REPORT_TEXT_BUDGET.
const ROOM_NAME_MAX = 80;
const NOTE_MAX = 2000;
const MAX_ROOMS = 30;
const REPORT_TEXT_BUDGET = 20_000;
const noteText = z.string().max(NOTE_MAX, `Keep this under ${NOTE_MAX} characters.`).nullable().optional();

const RoomPatchSchema = z.object({
  room_name: z.string().min(1).max(ROOM_NAME_MAX).optional(),
  condition_rating: RatingEnum.optional(),
  cleanliness_rating: RatingEnum.optional(),
  walls_status: noteText,
  floors_status: noteText,
  appliances_status: noteText,
  fixtures_status: noteText,
  notes: noteText,
});

export async function updateRoomRecord(
  id: string,
  patch: z.input<typeof RoomPatchSchema>,
): Promise<ActionResult> {
  return runAction("updateRoomRecord", async () => {
    z.uuid().parse(id);
    const parsed = RoomPatchSchema.parse(patch);
    const sb = await createClient();
    const { error } = await sb
      .from("move_out_room_records")
      .update(parsed)
      .eq("id", id)
      .eq("user_id", requireUserId());
    if (error) throw dbFailure("updateRoomRecord", error);
    revalidatePath("/lease");
    revalidatePath("/");
  });
}

export async function deleteRoom(id: string): Promise<ActionResult> {
  return runAction("deleteRoom", async () => {
    z.uuid().parse(id);
    const sb = await createClient();
    const { error } = await sb
      .from("move_out_room_records")
      .delete()
      .eq("id", id)
      .eq("user_id", requireUserId());
    if (error) throw dbFailure("deleteRoom", error);
    revalidatePath("/lease");
    revalidatePath("/");
  });
}

const WalkthroughPatchSchema = z.object({
  walkthrough_date: z.iso.date().nullable().optional(),
  overall_notes: noteText,
});

export async function updateWalkthrough(
  id: string,
  patch: z.input<typeof WalkthroughPatchSchema>,
): Promise<ActionResult> {
  return runAction("updateWalkthrough", async () => {
    z.uuid().parse(id);
    const parsed = WalkthroughPatchSchema.parse(patch);
    const sb = await createClient();
    const { error } = await sb
      .from("move_out_walkthroughs")
      .update(parsed)
      .eq("id", id)
      .eq("user_id", requireUserId());
    if (error) throw dbFailure("updateWalkthrough", error);
    revalidatePath("/lease");
    revalidatePath("/");
  });
}

// Stamps `pdf_generated_at = now()` after the PDF is successfully built. Used
// by the dashboard tile to show "PDF ready" + by the readiness aggregator
// (Wave A.3 stub: lib/data/move-readiness.ts:90) to flip `pdfGenerated: true`.
export async function markPdfGenerated(walkthroughId: string): Promise<ActionResult> {
  return runAction("markPdfGenerated", async () => {
    await stampPdfGenerated(z.uuid().parse(walkthroughId));
  });
}

async function stampPdfGenerated(walkthroughId: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("move_out_walkthroughs")
    .update({ pdf_generated_at: new Date().toISOString() })
    .eq("id", walkthroughId)
    .eq("user_id", requireUserId());
  if (error) throw dbFailure("markPdfGenerated", error);
  revalidatePath("/lease");
  revalidatePath("/");
}

// Renders the walkthrough report PDF on the server and returns it as a
// base64 string. The client converts it to a Blob, builds an object URL,
// and triggers a download (server actions can return Buffer-shaped data,
// but base64 is the safest serialization across the boundary).
//
// Reads live walkthrough + rooms + lease terms inside the action so the
// client doesn't need to forward stale state. Calls markPdfGenerated on
// success so the dashboard tile + the readiness aggregator both see the
// completion stamp.
const reportLimiter = createRateLimiter(5, 60_000);

export async function generateWalkthroughReport(
  walkthroughId: string,
): Promise<ActionResult<{ base64: string; filename: string }>> {
  return runAction("generateWalkthroughReport", async () => {
    z.uuid().parse(walkthroughId);
    if (!reportLimiter.allow(clientKey(await headers()))) {
      throw new ActionFailure("That's a lot of reports in a short time. Wait a minute and try again.");
    }
    const sb = await createClient();
    const userId = requireUserId();

    const { data: walkRow, error: walkErr } = await sb
      .from("move_out_walkthroughs")
      .select("*")
      .eq("id", walkthroughId)
      .eq("user_id", userId)
      .maybeSingle();
    if (walkErr) throw dbFailure("report.read", walkErr);
    if (!walkRow) throw new ActionFailure("That walkthrough no longer exists.");
    const walkthrough = MoveOutWalkthroughSchema.parse(walkRow);

    const { data: roomRows, error: roomsErr } = await sb
      .from("move_out_room_records")
      .select("*")
      .eq("user_id", userId)
      .eq("walkthrough_id", walkthroughId)
      .order("order_index", { ascending: true });
    if (roomsErr) throw dbFailure("report.readRooms", roomsErr);
    const rooms = (roomRows ?? []).map((r) => MoveOutRoomRecordSchema.parse(r));

    // Rows saved before the limits existed, or written another way, can still be large.
    const textLength =
      (walkthrough.overall_notes?.length ?? 0) +
      rooms.reduce(
        (sum, r) =>
          sum +
          [r.room_name, r.walls_status, r.floors_status, r.appliances_status, r.fixtures_status, r.notes].reduce(
            (n, text) => n + (text?.length ?? 0),
            0,
          ),
        0,
      );
    if (rooms.length > MAX_ROOMS || textLength > REPORT_TEXT_BUDGET) {
      throw new ActionFailure(
        "This walkthrough has too much text for one report. Shorten the notes and try again.",
      );
    }

    // Lease is optional — the walkthrough is usable for either move-out
    // (deposit defense) or move-in inspection, with or without a linked lease.
    const lease = await getActiveLease().catch((err) => {
      console.error("[action] generateWalkthroughReport.lease:", err);
      return null;
    });

    const householdName =
      lease?.residents.find((r) => r.isPrimary)?.name ??
      lease?.residents[0]?.name ??
      "Resident";

    let buffer: Buffer;
    try {
      const [{ renderToBuffer }, { WalkthroughReport }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/lib/pdf/walkthrough-report"),
      ]);
      buffer = await renderToBuffer(
        <WalkthroughReport
          walkthrough={walkthrough}
          rooms={rooms}
          lease={lease}
          household={{ name: householdName }}
        />,
      );
    } catch (err) {
      console.error("[action] generateWalkthroughReport.render:", err);
      throw new ActionFailure("Couldn't put the report together. Try again in a moment.");
    }

    await stampPdfGenerated(walkthroughId);

    const datePart = (walkthrough.walkthrough_date ?? todayInZoneIso()).replace(
      /-/g,
      "",
    );
    return {
      base64: buffer.toString("base64"),
      filename: `walkthrough-${datePart}.pdf`,
    };
  });
}
