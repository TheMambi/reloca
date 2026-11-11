import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
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
    .order("order_index", { ascending: true });
  if (error) throw new Error(`getUtilityTransitions: ${error.message}`);
  return (data ?? []).map((row) => UtilityTransitionSchema.parse(row));
});

export const getAddressTargets = cache(async (): Promise<AddressChangeTarget[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("address_change_targets").select("*")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("order_index", { ascending: true });
  if (error) throw new Error(`getAddressTargets: ${error.message}`);
  return (data ?? []).map((row) => AddressChangeTargetSchema.parse(row));
});
