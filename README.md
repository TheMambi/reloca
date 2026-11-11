# Reloca

A relocation cockpit for one household moving between cities. I built it to run my own move from Denver: one dark dashboard that holds the checklist, the lease decision, the address changes, the moving budget, and a side-by-side look at the city I was leaving and the one I was heading to.

This repo is the public, portfolio version. Every name, address and dollar figure in it is sample data.

**[Try the live demo](https://reloca-demo.vercel.app)**. It runs on sample data in memory, with no sign-up, and your edits reset from time to time.

![Reloca dashboard: countdown to move day, the Denver to Long Beach route, cost, community and air-quality tiles](docs/images/reloca-dashboard.png)

## What it does

- **Dashboard.** A countdown to move day, the next deadlines, and reference tiles that compare origin and destination on cost, climate and air quality. It switches to post-move states once the date passes.
- **Relocations.** Origin and destination are both swappable from a city pool (Denver, Long Beach, Sacramento). A switcher in the status row changes which pair you are looking at.
- **Checklist.** Moving tasks with due dates and drag-to-reorder.
- **Lease.** Pick stay, renew or vacate. A forecaster prices each path (renewal, leaving on time, one or two months month-to-month), a composer drafts the notice to vacate, and an insurance panel tracks coverage across both homes so there is no gap. A move-out walkthrough exports a PDF report.
- **Address changes.** Bank, employer, DMV, voter registration, insurance and subscriptions, each with its own deadline.
- **Moving cost and cost of living.** Budget for the move itself, plus a category-by-category comparison of the two cities.
- **Properties.** Neighborhoods and sample listings on a map, with a dialog that reads a listing URL you paste and fills in the details.

  ![Properties page: Long Beach neighborhoods on a dark map with rent ranges per neighborhood](docs/images/reloca-properties.png)

## Data and where it comes from

Every reference number in the UI is labeled with how it was made, because some of it is live and some of it is my estimate:

| Tier | Sources |
| --- | --- |
| Live | HUD Fair Market Rent, NOAA climate normals, EPA AirNow, EPA National Walkability Index |
| Modeled | Cost of living, crime and climate hazards, built from public data and labeled as estimates |
| Sample | Listings and community notes |

`scripts/ingest-city.ts` refreshes the live tiers from the free APIs and writes JSON snapshots into `data/`.

## Stack

Next.js 15 (App Router, Turbopack), TypeScript, Tailwind CSS with shadcn/ui, Supabase (Postgres with row level security), Zod for every data shape, MapLibre with CARTO tiles, Recharts, React PDF. Hosted on Vercel.

## How I built it

I built Reloca with Claude Code as my coding partner. The project ran on a written rules file for the agent and moved in phases: brainstorm, blueprint, schema approval, then build in small waves, each one gated on tests and a clean production build. `docs/schema.md` documents the data model. Code comments that cite `AD-0NN` point to the private decision log, which is not part of this repo.

The hero image in `public/` was generated with an AI image model, and its file carries content credentials that say so.

## Run it locally

The quickest way in needs no database. Demo mode runs on fictional sample data held in memory:

```bash
pnpm install
RELOCA_DEMO_MODE=1 pnpm dev
```

To run it on your own data you need Node 20+, pnpm, and a free Supabase project.

1. `pnpm install`
2. Copy `.env.template` to `.env.local` and fill in your Supabase URL and keys. The API keys for HUD, NOAA, Census and AirNow are only needed if you run the ingest script.
3. Pick a UUID for `RELOCA_SINGLE_USER_ID`. Run the files in `supabase/migrations/` in order in the Supabase SQL editor, replacing the `<RELOCA_SINGLE_USER_ID>` placeholder with that UUID. Migration 0023 seeds a sample move for the user it finds in `checklist_items`, so on an empty database skip it and add your move from the app instead.
4. `pnpm dev`

Tests are plain TypeScript scripts: `npx tsx path/to/file.test.ts`.

## Limits

Reloca is built for a single household. There is no sign-in: the database policies trust any request that carries the project's anon key, and my real deployment sits behind Vercel's login wall. The public demo runs in demo mode, so it has no database at all. If you deploy your own copy with Supabase, keep it private or add real authentication first.

## License

MIT. See `LICENSE`.

Made by The Mambí · [themambi.com](https://themambi.com)
