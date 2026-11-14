/**
 * Thrown by a reference loader when a city has no data file. Callers that can
 * show a blank for such a city catch this one error. Anything else, such as a
 * file that fails its schema, is a broken data file and must surface.
 */
export class MissingCityDataError extends Error {}

/** The loader's value, or null when the city has no data file. */
export function orNullIfMissing<T>(load: () => T): T | null {
  try {
    return load();
  } catch (err) {
    if (err instanceof MissingCityDataError) return null;
    throw err;
  }
}
