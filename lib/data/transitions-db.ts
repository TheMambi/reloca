import "server-only";
import { cache } from "react";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { parseRows } from "@/lib/data/parse-rows";
import {
  UtilityTransitionSchema,
  AddressChangeTargetSchema,
  type UtilityTransition,
  type AddressChangeTarget,
} from "@/schemas/transitions";

export const getUtilityTransitions = cache(async (): Promise<UtilityTransition[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("utility_transitions").select("*")
    .eq("user_id", requireUserId())
    .order("order_index", { ascending: true });
  if (error) throw new Error(`getUtilityTransitions: ${error.message}`);
  return parseRows(UtilityTransitionSchema, data ?? [], "utility_transitions");
});

export const getAddressTargets = cache(async (): Promise<AddressChangeTarget[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("address_change_targets").select("*")
    .eq("user_id", requireUserId())
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("order_index", { ascending: true });
  if (error) throw new Error(`getAddressTargets: ${error.message}`);
  return parseRows(AddressChangeTargetSchema, data ?? [], "address_change_targets");
});
