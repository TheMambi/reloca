# Known pitfalls

Symptom, cause and fix for traps this project has already hit. Read before touching the area named.

| Area | Symptom | Cause | Fix |
|---|---|---|---|
| Build | `pnpm build` stops with "Failed to fetch `Geist` from Google Fonts" | `next/font/google` downloads the font files during the build, so a blocked network or a Google Fonts outage breaks it | Load fonts from the `geist` package (`geist/font/sans`, `geist/font/mono`), which ships the files; keep `next/font/google` out of the app |
| Schemas | Saving one field resets others to their starting values (lease decision back to undecided, monthly premium back to 0) | Zod fills a `.default()` for every missing key, even after `.partial()`, so a patch schema built from a shape with defaults writes those defaults over saved data | Keep defaults on create schemas only. Build patches from the row schema's own fields with `.pick()`, `.partial()` and `.strict()`, as `schemas/lease.ts` does |
