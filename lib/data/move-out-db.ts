import "server-only";
import { cache } from "react";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { parseRow, parseRows } from "@/lib/data/parse-rows";
import {
  MoveOutWalkthroughSchema,
  MoveOutRoomRecordSchema,
  type MoveOutWalkthrough,
  type MoveOutRoomRecord,
} from "@/schemas/move-out";

// v1 keeps at most one active walkthrough per user. The schema doesn't
// constrain this (a future user might want a move-OUT record AND a move-IN
// inspection record at the destination), but the loader picks the latest by
// created_at so the embedded /lease section + the dashboard tile read a
// single source of truth.
export const getActiveWalkthrough = cache(
  async (): Promise<MoveOutWalkthrough | null> => {
    const sb = await createClient();
    const { data, error } = await sb
      .from("move_out_walkthroughs")
      .select("*")
      .eq("user_id", requireUserId())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`getActiveWalkthrough: ${error.message}`);
    if (!data) return null;
    return parseRow(MoveOutWalkthroughSchema, data, "move_out_walkthroughs");
  },
);

export const getRoomRecords = cache(
  async (walkthroughId: string): Promise<MoveOutRoomRecord[]> => {
    const sb = await createClient();
    const { data, error } = await sb
      .from("move_out_room_records")
      .select("*")
      .eq("user_id", requireUserId())
      .eq("walkthrough_id", walkthroughId)
      .order("order_index", { ascending: true });
    if (error) throw new Error(`getRoomRecords: ${error.message}`);
    return parseRows(MoveOutRoomRecordSchema, data ?? [], "move_out_room_records");
  },
);

// Convenience wrapper: the /lease embedded section needs both halves. Returns
// `walkthrough = null` when nothing's started yet — caller renders the
// "Begin walkthrough" button. When present, `rooms` is the full ordered list.
export async function getActiveWalkthroughWithRooms(): Promise<{
  walkthrough: MoveOutWalkthrough | null;
  rooms: MoveOutRoomRecord[];
}> {
  const walkthrough = await getActiveWalkthrough();
  if (!walkthrough) return { walkthrough: null, rooms: [] };
  const rooms = await getRoomRecords(walkthrough.id);
  return { walkthrough, rooms };
}
