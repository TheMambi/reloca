// Kept free of file reads so the middleware can use it too.

/** The address segment for a neighborhood name ("Belmont Shore" → "belmont-shore"). */
export function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}
