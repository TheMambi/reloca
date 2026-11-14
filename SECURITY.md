# Security

Reloca is a Next.js app for one household. It runs in one of two modes. The public demo holds fictional sample data in memory and has no database. A private copy reads and writes its owner's Supabase database from the server and has no sign-in of its own.

## Reporting a problem

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Please don't open a public issue for something that could be exploited.

Include what you found, how to reproduce it, and which page, action or file it affects. Expect a first reply within a week.

## What is in scope

- The code in this repository.
- The public demo linked in the README.

Supabase, Vercel, CARTO and the public data providers are not part of this project. Report problems with those to them.

## How the app is hardened

- **Two modes, no default.** `RELOCA_MODE` has to name the mode. An unset or mistyped value stops the app before it serves anything, so a deployment cannot fall back to the database by accident.
- **The database is closed to the browser.** Only the server talks to Supabase, with the service role key, and it adds the household's id to every query. The migrations take every privilege away from the public API roles. `docs/security-lockdown.md` has the rollout and the checks.
- **No sign-in.** A private copy has to sit behind something that keeps strangers out, such as Vercel's Deployment Protection. It will not start until `RELOCA_ACCESS_GATE` names that gate. `docs/auth-design.md` describes real sign-in, which is not built yet.
- **Checked input.** Every server action parses its arguments with Zod before it touches the database, and answers a failure with a plain sentence instead of database text. Saved links must be http or https.
- **Headers.** Every response carries a Content-Security-Policy with a new nonce per request, plus no-framing, no content-type guessing, a short referrer and HSTS (`lib/security-headers.ts`, `next.config.ts`, `middleware.ts`). A private copy asks search engines to stay out.
- **The demo.** Each visitor gets a private in-memory copy of the sample data, keyed by a random cookie. A request without that cookie can read the sample data and cannot write. Each copy is capped at one megabyte and 100 rows per table, and the instance keeps 200 copies.
- **Rate limits.** Server actions, the listing reader and the PDF report are limited per address. The count is kept in one process, so on serverless hosting it slows a burst and does not replace a firewall rule.
- **The listing reader.** It fetches only public https addresses, honors robots.txt, reads only the structured data a page publishes about itself and caps what it downloads.
- **Dependencies.** A lockfile with integrity hashes. `package.json` pins the pnpm version and names the dependencies whose install scripts are not run. CI installs with scripts off. Dependabot opens update pull requests for npm and for GitHub Actions.
- **CI.** On every push to `dev` and `main`, on every pull request and once a week, CI runs `pnpm audit`, lint, the type checker, every test in two time zones and a production build. A second job builds the schema from the migrations in a throwaway PostgreSQL and runs the SQL checks. The workflow has read-only permissions, keeps no credentials after checkout and pins each action to a commit.

## Known and accepted

- `pnpm audit --prod` reports nothing. The full audit reports one moderate advisory in `minimatch` 10, a dependency of the lint tooling. The fix is a major version that the lint packages do not accept yet. It only ever reads this repository's own file patterns, and CI fails on anything rated high.
- `style-src` in the Content-Security-Policy still allows inline styles, because several components set style attributes.
