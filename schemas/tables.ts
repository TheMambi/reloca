import { ChecklistItemSchema } from "./checklist";
import {
  DestinationSchema,
  InsurancePolicySchema,
  LeaseEventSchema,
  LeaseTermsSchema,
  NoticeDraftSchema,
} from "./lease";
import { MoveEstimateSchema } from "./move-cost";
import { MoveOutRoomRecordSchema, MoveOutWalkthroughSchema } from "./move-out";
import { RelocationSchema } from "./relocation";
import { SavedNeighborhoodSchema } from "./saved-neighborhood";
import { AddressChangeTargetSchema, UtilityTransitionSchema } from "./transitions";

/**
 * The row schema of every database table. The demo database takes its column
 * lists from here, and lib/supabase/schema-drift.test.ts holds these shapes
 * against lib/supabase/types.ts and against a database built from the
 * migrations, so a column added in one place and not the other fails a check.
 */
export const TABLE_SCHEMAS = {
  address_change_targets: AddressChangeTargetSchema,
  checklist_items: ChecklistItemSchema,
  destinations: DestinationSchema,
  insurance_policies: InsurancePolicySchema,
  lease_events: LeaseEventSchema,
  lease_terms: LeaseTermsSchema,
  move_estimates: MoveEstimateSchema,
  move_out_room_records: MoveOutRoomRecordSchema,
  move_out_walkthroughs: MoveOutWalkthroughSchema,
  notice_drafts: NoticeDraftSchema,
  relocations: RelocationSchema,
  saved_neighborhoods: SavedNeighborhoodSchema,
  utility_transitions: UtilityTransitionSchema,
} as const;
