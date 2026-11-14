import type { z } from "zod";

/** app/error.tsx shows its own message for an error that carries this. */
export const DAMAGED_RECORD_DIGEST = "RELOCA_DAMAGED_RECORD";

/** A stored row that does not match its schema. */
export class DamagedRecordError extends Error {
  // In production Next hides an error's message from the browser and sends
  // only `digest`, and it keeps a digest that is already set.
  digest = DAMAGED_RECORD_DIGEST;
}

/**
 * Parses one database row. A row the schema rejects stops the page with a
 * DamagedRecordError, so the screen can say a record is damaged instead of
 * showing the generic failure. The log names the table, the row and the
 * fields. It leaves the values out: they may be personal.
 */
export function parseRow<S extends z.ZodType>(schema: S, row: unknown, table: string): z.output<S> {
  const result = schema.safeParse(row);
  if (result.success) return result.data;
  const id = (row as { id?: unknown } | null)?.id;
  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ");
  const detail = `${table} row ${typeof id === "string" ? id : "(no id)"}: ${fields}`;
  console.error(`[data] a stored row does not match its schema. ${detail}`);
  throw new DamagedRecordError(`Damaged record. ${detail}`);
}

export function parseRows<S extends z.ZodType>(schema: S, rows: unknown[], table: string): z.output<S>[] {
  return rows.map((row) => parseRow(schema, row, table));
}
