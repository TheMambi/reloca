import type { NextConfig } from "next";
import { appMode } from "./lib/mode";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Content-Security-Policy is not here: it carries a nonce that changes
  // on every request, so middleware.ts sets it.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders(appMode()) }];
  },
};

export default nextConfig;
