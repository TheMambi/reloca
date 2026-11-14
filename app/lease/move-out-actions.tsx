"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, friendlyDbError, requireUserId } from "@/lib/supabase/server";
import {
  MoveOutWalkthroughSchema,
  MoveOutRoomRecordSchema,
  RatingEnum,
  type MoveOutWalkthrough,
  type MoveOutRoomRecord,
} from "@/schemas/move-out";
import { getActiveLease } from "@/lib/data/lease-db";
import { todayInZoneIso } from "@/lib/dates";
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
export async function createWalkthrough(): Promise<{
  walkthrough: MoveOutWalkthrough;
  rooms: MoveOutRoomRecord[];
}> {
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
  if (readErr) throw new Error(`createWalkthrough.read: ${readErr.message}`);

  if (existing) {
    const walkthrough = MoveOutWalkthroughSchema.parse(existing);
    const { data: rooms, error: roomsErr } = await sb
      .from("move_out_room_records")
      .select("*")
      .eq("user_id", userId)
      .eq("walkthrough_id", walkthrough.id)
      .order("order_index", { ascending: true });
    if (roomsErr)
      throw new Error(`createWalkthrough.readRooms: ${roomsErr.message}`);
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
    throw new Error(`createWalkthrough.create: ${createErr.message}`);

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
    throw new Error(`createWalkthrough.seedRooms: ${seedErr.message}`);

  const rooms = (insertedRooms ?? []).map((r) =>
    MoveOutRoomRecordSchema.parse(r),
  );

  revalidatePath("/lease");
  revalidatePath("/");
  return { walkthrough, rooms };
}

export async function addRoom(
  walkthroughId: string,
  roomName: string,
): Promise<MoveOutRoomRecord> {
  const trimmed = roomName.trim();
  if (trimmed.length === 0) throw new Error("Room name required");

  const sb = await createClient();
  const userId = requireUserId();

  // Compute order_index = max(existing) + 1 within this walkthrough.
  const { data: maxRow, error: maxErr } = await sb
    .from("move_out_room_records")
    .select("order_index")
    .eq("user_id", userId)
    .eq("walkthrough_id", walkthroughId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw new Error(`addRoom.maxOrder: ${maxErr.message}`);
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
  if (error) throw new Error(`addRoom.insert: ${error.message}`);

  revalidatePath("/lease");
  revalidatePath("/");
  return MoveOutRoomRecordSchema.parse(data);
}

const RoomPatchSchema = z.object({
  room_name: z.string().min(1).optional(),
  condition_rating: RatingEnum.optional(),
  cleanliness_rating: RatingEnum.optional(),
  walls_status: z.string().nullable().optional(),
  floors_status: z.string().nullable().optional(),
  appliances_status: z.string().nullable().optional(),
  fixtures_status: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function updateRoomRecord(
  id: string,
  patch: z.input<typeof RoomPatchSchema>,
): Promise<void> {
  const parsed = RoomPatchSchema.parse(patch);
  const sb = await createClient();
  const { error } = await sb
    .from("move_out_room_records")
    .update(parsed)
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`updateRoomRecord: ${error.message}`);
  revalidatePath("/lease");
  revalidatePath("/");
}

export async function deleteRoom(id: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("move_out_room_records")
    .delete()
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`deleteRoom: ${error.message}`);
  revalidatePath("/lease");
  revalidatePath("/");
}

const WalkthroughPatchSchema = z.object({
  walkthrough_date: z.iso.date().nullable().optional(),
  overall_notes: z.string().nullable().optional(),
});

export async function updateWalkthrough(
  id: string,
  patch: z.input<typeof WalkthroughPatchSchema>,
): Promise<void> {
  const parsed = WalkthroughPatchSchema.parse(patch);
  const sb = await createClient();
  const { error } = await sb
    .from("move_out_walkthroughs")
    .update(parsed)
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`updateWalkthrough: ${error.message}`);
  revalidatePath("/lease");
  revalidatePath("/");
}

// Stamps `pdf_generated_at = now()` after the PDF is successfully built. Used
// by the dashboard tile to show "PDF ready" + by the readiness aggregator
// (Wave A.3 stub: lib/data/move-readiness.ts:90) to flip `pdfGenerated: true`.
export async function markPdfGenerated(walkthroughId: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("move_out_walkthroughs")
    .update({ pdf_generated_at: new Date().toISOString() })
    .eq("id", walkthroughId)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`markPdfGenerated: ${error.message}`);
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
export async function generateWalkthroughReport(
  walkthroughId: string,
): Promise<{
  ok: true;
  base64: string;
  filename: string;
} | {
  ok: false;
  error: string;
}> {
  const sb = await createClient();
  const userId = requireUserId();

  const { data: walkRow, error: walkErr } = await sb
    .from("move_out_walkthroughs")
    .select("*")
    .eq("id", walkthroughId)
    .eq("user_id", userId)
    .maybeSingle();
  if (walkErr)
    return { ok: false, error: friendlyDbError("report.read", walkErr) };
  if (!walkRow)
    return { ok: false, error: "Walkthrough not found" };
  const walkthrough = MoveOutWalkthroughSchema.parse(walkRow);

  const { data: roomRows, error: roomsErr } = await sb
    .from("move_out_room_records")
    .select("*")
    .eq("user_id", userId)
    .eq("walkthrough_id", walkthroughId)
    .order("order_index", { ascending: true });
  if (roomsErr)
    return { ok: false, error: friendlyDbError("report.readRooms", roomsErr) };
  const rooms = (roomRows ?? []).map((r) => MoveOutRoomRecordSchema.parse(r));

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
    return {
      ok: false,
      error: "Couldn't put the report together — try again in a moment.",
    };
  }

  await markPdfGenerated(walkthroughId);

  const datePart = (walkthrough.walkthrough_date ?? todayInZoneIso()).replace(
    /-/g,
    "",
  );
  return {
    ok: true,
    base64: buffer.toString("base64"),
    filename: `walkthrough-${datePart}.pdf`,
  };
}
