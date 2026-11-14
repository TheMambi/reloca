# Real sign-in: design

> **DRAFT. Nothing in this document has been applied.** The app has no sign-in of its own today, and this change does not add one. This is the plan for adding it, written so the work can be picked up later without re-deciding anything. The SQL that goes with it is in `docs/auth-draft.sql`, with a test in `docs/auth-draft-test.sql`. Both are drafts too. They sit under `docs/`, not `supabase/migrations/`, so that no tool applies them. They were tried only on a throwaway local PostgreSQL 16 with a stand-in for Supabase's auth schema, never on a Supabase project.

## Where things stand

The database is closed to everyone except the server (`docs/security-lockdown.md`). That was containment:

- The server reaches the data with the service role key, which skips row level security. The most powerful credential the project has sits in the web runtime and is used on every request.
- The database filters nothing. Each query carries `.eq("user_id", requireUserId())`, and a test fails if one does not. One missed filter in a future change would go unnoticed by the database.
- Whoever can open a private deployment can use the app. Something outside the app, named in `RELOCA_ACCESS_GATE`, has to keep strangers out, and the app cannot check that it does.
- `RELOCA_SINGLE_USER_ID` is a fixed id from a setting, not a person who proved who they are.

## Where this goes

- A visitor who is not signed in gets a sign-in page from the app itself, on every address.
- A signed-in person's requests reach the database as that person. The database, not the code, decides which rows they can touch: `user_id = (select auth.uid())` on every table.
- No request path uses the service role key. It leaves the hosting settings and stays in `.env.local` for local scripts.
- New accounts cannot be created from outside. The one existing user keeps every row.
- The demo is unchanged: no sign-in, sample data in memory.

## What changes in the code

None of this is done. File names are today's.

| Where | Change |
|---|---|
| `lib/supabase/server.ts` | `createClient()` builds a request-scoped client with `createServerClient` from `@supabase/ssr` (already a dependency, unused since the lockdown), the project URL, the publishable key, and the request's cookies (`getAll`, `setAll`). `requireUserId()` becomes async and returns the id from the verified session (`supabase.auth.getClaims()`), throwing when there is none. Never take the id from `getSession()` alone: it reads the cookie without verifying it. `createAdminClient()` leaves this file. |
| `middleware.ts` | In private mode: refresh the session on every request (the `@supabase/ssr` pattern: build the client on the request and response cookies, call `getClaims()`), and redirect to `/login` when there is no user. Keep the demo cookie logic and the rate limits as they are. The middleware is the first check, not the only one. |
| `app/login/` | A page with email and password and one server action that calls `signInWithPassword`. No sign-up page, no "forgot password" page at first (the owner can reset a password in the Supabase dashboard). The same message for every failure. The existing rate limiter covers the action. |
| Header | A sign-out control that calls `signOut()` and returns to `/login`. |
| Every server action | Starts with `requireUserId()`. An action is a public endpoint, and a path the middleware skips must still refuse a caller with no session. Row level security is the backstop if one forgets. |
| `app/lease/actions.ts`, `lib/lease/overlays.ts`, `lib/data/checklist-db.ts` | `recomputeLeaseEvents` and `seedLeaseChecklistTasks` move out of the `"use server"` file into a plain server module (for example `lib/lease/events.ts`), so they are not endpoints. They, `recomputeDestinationOverlays` and `seedChecklistIfEmpty` switch from `createAdminClient()` to `createClient()`. |
| `lib/mode.ts`, `.env.template` | Private mode needs `SUPABASE_URL` and the publishable key (public by design, and safe once `anon` has no grants). It stops reading `SUPABASE_SERVICE_ROLE_KEY` and `RELOCA_SINGLE_USER_ID`. `RELOCA_ACCESS_GATE` gains the value `sign-in`, or goes away. |
| `scripts/keepalive.sh` | No change. It keeps using the service role key from `.env.local`. |
| `lib/supabase/user-scope.test.ts` | The stand-in gets a signed-in user. Keep the `.eq("user_id", ...)` filters and the test: they become the second layer, and they keep queries on the index. |
| Demo mode | No change. `isDemoMode()` short-circuits before any of the above. |

## What changes in the database

`docs/auth-draft.sql`, one statement that applies completely or not at all:

1. It stops unless a sign-in user exists and every stored row already belongs to one.
2. `user_id` on all 13 tables becomes a foreign key to `auth.users (id)` with no delete action, so deleting the user in the dashboard is refused while rows exist.
3. Child rows must hang off a parent of the same user: `lease_events`, `notice_drafts` and `move_out_walkthroughs` to `lease_terms`, `move_out_room_records` to `move_out_walkthroughs`, `destinations` and `saved_neighborhoods` to `relocations`, each as a second foreign key on `(parent id, user_id)`. Foreign keys are checked without regard to policies, so policies alone would let a person attach a row of their own to someone else's lease.
4. Each table gets four policies, `owner_select`, `owner_insert`, `owner_update` and `owner_delete`, all `TO authenticated` and all comparing `user_id` with `(select auth.uid())`. `authenticated` gets select, insert, update and delete. `anon` gets nothing.
5. `authenticated` may call `reorder_checklist_item`. It already runs with the caller's rights, so the policies apply inside it and it finds only the caller's own tasks.
6. It verifies the result (nothing for `anon`, row level security on, exactly those four policies on every table) and fails otherwise.

The service role keeps its access, so the app that runs today is unaffected by this statement. That is what makes the rollout below safe to do in steps.

What the draft leaves alone: it does not set a default on `user_id` (the code keeps sending it, and the insert policy checks it), and it does not touch the body of `reorder_checklist_item`.

## How the existing rows carry over

Every row carries the id in `RELOCA_SINGLE_USER_ID`. Create the sign-in user **with that same id**, and no row has to change.

From your own machine, once, with the values read from `.env.local` and the email and password typed at a prompt or passed as environment variables (never written into a file or a command you paste somewhere):

```ts
const { data, error } = await admin.auth.admin.createUser({
  id: process.env.RELOCA_SINGLE_USER_ID,
  email: process.env.OWNER_EMAIL,
  password: process.env.OWNER_PASSWORD,
  email_confirm: true,
});
```

`admin` is a client built with the service role key. The installed client library documents `id` as "allows you to overwrite the default id set for the user". Check that `data.user.id` equals the id you sent before going on. If the Auth server ignored it, delete that user and use the fallback.

**Fallback: move the rows to the new user's id.** Only if the id cannot be chosen. This one does interrupt the running app, because the server still filters by the old id: put the app in maintenance first, run it, set `RELOCA_SINGLE_USER_ID` to the new id, redeploy. It stops unless there is exactly one sign-in user and exactly one id in the data. Every `updated_at` moves to now.

```sql
DO $rekey$
DECLARE
  new_id uuid;
  old_ids uuid[] := '{}';
  found uuid[];
  tbl text;
BEGIN
  IF (SELECT count(*) FROM auth.users) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one sign-in user. Nothing was changed.';
  END IF;
  SELECT id INTO new_id FROM auth.users;
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id' ORDER BY 1
  LOOP
    EXECUTE format('SELECT coalesce(array_agg(DISTINCT user_id), ''{}'') FROM public.%I', tbl) INTO found;
    old_ids := ARRAY(SELECT DISTINCT unnest(old_ids || found));
  END LOOP;
  old_ids := array_remove(old_ids, new_id);
  IF cardinality(old_ids) > 1 THEN
    RAISE EXCEPTION 'The data holds % other user ids. This only moves one. Nothing was changed.', cardinality(old_ids);
  END IF;
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id' ORDER BY 1
  LOOP
    EXECUTE format('UPDATE public.%I SET user_id = $1 WHERE user_id = ANY ($2)', tbl) USING new_id, old_ids;
  END LOOP;
END
$rekey$;
```

Run the fallback before `docs/auth-draft.sql`, never after: once the same-owner foreign keys exist, a parent and its children can no longer be moved one table at a time.

## Rollout order

Each step leaves a working app, and the next one can wait as long as needed.

1. **Dashboard settings** (Authentication): turn off "Allow new users to sign up" and anonymous sign-ins, keep email confirmation on, set the Site URL and the redirect allow-list to the app's own address, turn on leaked-password protection if the plan has it. Nothing uses sign-in yet, so nothing changes for the app.
2. **Create the user** with the existing id, as above. Sign in once from a scratch script to confirm the password works.
3. **Turn the draft into a migration**: move `docs/auth-draft.sql` to `supabase/migrations/` under the next number, and make the changes in "When the draft becomes a migration" below. Run `pnpm db:check`. Push it. The running app still uses the service role key and behaves exactly as before. Run the read-only checks in "What to test".
4. **Ship the code** from "What changes in the code" to a preview deployment that points at the same database, with the publishable key set. Sign in there and click through every page. The production deployment is untouched and still works, because both kinds of access are open at once.
5. **Promote it to production.** Confirm the new deployment is the one serving, sign in, save one change on each page.
6. **Remove `SUPABASE_SERVICE_ROLE_KEY` and `RELOCA_SINGLE_USER_ID` from the hosting settings**, redeploy, and confirm the app still works. This is the step that retires the key from requests. Keep both in `.env.local`.
7. **Decide about the outside gate.** Hosting-level protection can stay as a second door or come off. With it off, the sign-in page is what the internet sees.
8. Consider rotating the service role key, since it has lived in the hosting settings.

## Rollback

| After step | To go back |
|---|---|
| 1, 2 | Nothing to undo. An unused user and closed sign-up harm nothing. |
| 3 | The app does not depend on the migration. To remove it anyway, run the undo below. |
| 4 | Delete the preview deployment. |
| 5 | Promote the previous production deployment again. It uses the service role key, which is still set until step 6, so it works at once. |
| 6 | Put the two settings back and redeploy the previous deployment. Because this is the only step that needs a secret re-entered, do it last and only after a few days on step 5. |

Undo for the migration. It removes what the draft added and nothing else: afterwards only the service role reaches the tables, as before. Tried locally: the schema dump afterwards equals the dump from before the draft.

```sql
DO $undo$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id' ORDER BY 1
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS owner_select ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_insert ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_update ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_delete ON public.%I', tbl);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', tbl);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_same_owner_fkey');
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_user_id_fkey');
  END LOOP;
  ALTER TABLE public.lease_terms DROP CONSTRAINT IF EXISTS lease_terms_id_user_id_key;
  ALTER TABLE public.move_out_walkthroughs DROP CONSTRAINT IF EXISTS move_out_walkthroughs_id_user_id_key;
  ALTER TABLE public.relocations DROP CONSTRAINT IF EXISTS relocations_id_user_id_key;
  REVOKE ALL ON FUNCTION public.reorder_checklist_item(uuid, text, integer) FROM authenticated;
END
$undo$;
```

## What to test

In the database, locally (`docs/auth-draft-test.sql` does all of these with two users):

- A signed-in person reads only their own rows in every table, and an update or delete aimed at another person's rows touches none.
- They cannot insert a row with another person's `user_id`, give a row away, or attach an event to another person's lease.
- They can reorder their own tasks and get "not found" for someone else's.
- A token with no user in it reads nothing. A visitor who is not signed in is refused on every table and on the function.
- The service role still reaches everything.
- The draft refuses to run with no sign-in user, with rows that belong to no user, and with an extra policy on any table. Running it twice changes nothing.

On the hosted database after step 3, read-only: check 2 from `docs/security-lockdown.md` now shows four policies per table, and a request to `/rest/v1/lease_terms?select=id` with the publishable key and no session still answers with a permission error.

In the app, automated:

- With no session, every page redirects to `/login` and every server action refuses. One test should call each exported action with no session, the way `user-scope.test.ts` walks them today.
- With a session, the existing flow tests pass unchanged.
- `grep -rn createAdminClient app lib` finds no caller on a request path. The app builds and runs with `SUPABASE_SERVICE_ROLE_KEY` unset.
- After `next build`, `.next/server/server-reference-manifest.json` lists no id for `recomputeLeaseEvents`, `seedLeaseChecklistTasks` or `seedChecklistIfEmpty`.

In a browser, by hand: sign in, reload, sign out, the back button after sign-out, a wrong password five times (the limiter answers), an expired session during a save (the save fails with a message and the page goes to sign-in), and the same on a phone.

## When the draft becomes a migration

- Move `docs/auth-draft.sql` to `supabase/migrations/` under the next free number and delete the draft banner. Move `docs/auth-draft-test.sql` to `supabase/tests/`.
- `supabase/tests/lockdown.sql` expects `authenticated` to be refused everywhere. After this change it must expect the opposite for a signed-in user's own rows. The new test covers that, so reduce `lockdown.sql` to the `anon` half or fold the two together. Its sample rows, and those in `supabase/tests/checks.sql`, need their user inserted into `auth.users` first.
- `scripts/db-check.sh` runs on plain PostgreSQL, which has no `auth` schema. Give it a stand-in before the migrations run: an `auth.users (id uuid primary key)` table and an `auth.uid()` that reads `sub` from the `request.jwt.claims` setting, which is how Supabase's own function works.
- `docs/security-lockdown.md`: check 1 lists what `anon` and `authenticated` can reach and says it must return nothing. Split it: nothing for `anon`, the 13 tables and the one function for `authenticated`.
- Regenerate `lib/supabase/types.ts`. The new foreign keys appear under `Relationships`.

## Decisions for the owner

- **Password or emailed link.** The plan assumes a password. An emailed link needs working email delivery and a callback route, and locks you out if the mailbox is unavailable.
- **A second factor.** Supabase Auth supports one. It can be added later without touching the policies.
- **A second person.** The policies give each signed-in user their own separate data. Two people sharing one household's data is a different model (a household id on every row) and is not what this draft builds.
- **Keep or drop the outside gate** once sign-in is live (rollout step 7).

## What has and has not been proved

Proved on a local PostgreSQL 16, with a stand-in `auth` schema: the draft applies, applies again without change, refuses in the three cases listed, passes the two-user test, and the test fails when a same-owner foreign key is removed or a permissive policy is added. The undo restores the earlier schema exactly. The fallback moves one user's rows and refuses two.

Not proved: anything against a real Supabase project, including whether the hosted Auth server honours a chosen user id and whether the migration's role may reference `auth.users`. None of the code in "What changes in the code" has been written, so the finding this answers (the service role key on request paths, RL-APP-04) is still open.
