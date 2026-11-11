import { z } from "zod";

export const UtilityKindEnum = z.enum([
  "electricity","gas","water","trash","internet","tv","custom"
]);
export const UtilitySideEnum = z.enum(["origin","destination"]);
export const UtilityStatusEnum = z.enum([
  "needs_action","scheduled","in_progress","confirmed","skipped"
]);

export const UtilityTransitionSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  kind: UtilityKindEnum,
  side: UtilitySideEnum,
  custom_label: z.string().nullable(),
  provider: z.string().nullable(),
  account_number: z.string().nullable(),
  login_url: z.url().nullable(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  scheduled_date: z.iso.date().nullable(),
  status: UtilityStatusEnum,
  confirmed_at: z.iso.datetime({ offset: true }).nullable(),
  order_index: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export type UtilityTransition = z.infer<typeof UtilityTransitionSchema>;

export const AddressTargetKindEnum = z.enum([
  "usps","bank","employer","dmv","voter_reg",
  "auto_insurance","health_insurance","subscription","custom"
]);
export const AddressTargetChannelEnum = z.enum([
  "online","phone","in_person","mail"
]);
export const AddressTargetStatusEnum = z.enum([
  "needs_action","submitted","confirmed","skipped"
]);

export const AddressChangeTargetSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  kind: AddressTargetKindEnum,
  name: z.string().min(1),
  due_date: z.iso.date().nullable(),
  channel: AddressTargetChannelEnum.nullable(),
  reference_number: z.string().nullable(),
  status: AddressTargetStatusEnum,
  submitted_at: z.iso.datetime({ offset: true }).nullable(),
  confirmed_at: z.iso.datetime({ offset: true }).nullable(),
  notes: z.string().nullable(),
  order_index: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export type AddressChangeTarget = z.infer<typeof AddressChangeTargetSchema>;
