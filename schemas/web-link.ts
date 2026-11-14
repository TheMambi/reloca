import { z } from "zod";

export const WEB_LINK_MAX = 2000;

/**
 * A link a person may save: http or https only. z.url() on its own also
 * accepts javascript:, data: and file: addresses.
 */
export const WebLinkSchema = z.url({ protocol: /^https?$/ }).max(WEB_LINK_MAX);

/**
 * The address to put in an href, or undefined when it is not a plain web
 * link. Rows already stored are read without the rule above, so a link is
 * checked again where it is drawn.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
