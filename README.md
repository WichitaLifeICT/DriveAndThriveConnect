# Drive & Thrive Connect

Community ride coordination for Wichita: riders post ride requests, and
drivers from their personal network, their organization, or the wider pool
of admin-approved drivers offer to take them.

Built with **Next.js 16** (App Router, server actions), **Supabase**
(Postgres, auth, storage, realtime) and **Resend** (email).

> Setup steps that need an account or a decision (email domain, cron,
> Supabase settings) are tracked in [`WORK_QUEUE.md`](WORK_QUEUE.md).

## Features

- **Rides** — one-off, round trip (optionally as a separate return ride), or
  weekly for up to 12 weeks. Riders choose who sees each request: direct
  connections, their organization's approved drivers, or all approved
  community drivers. Riders can edit open requests and cancel one ride or a
  whole series. Unmatched rides expire automatically after their time passes.
- **Offers** — drivers offer, riders accept or decline. Drivers can withdraw
  an offer, or back out of a matched ride (which reopens it and re-notifies
  drivers). Riders can report a driver no-show.
- **During the ride** — pickup / drop-off check-ins, the other person's phone
  number (if they allow it), a live trip-status link to share with a trusted
  contact, a one-tap text to the rider's emergency contact, and a 911 button.
- **Safety** — block (hides rides, messages and requests both ways), report
  (emails every admin), admin suspension (signs the person out, bans login,
  cancels their rides and offers, reopens rides they were driving).
- **Driver approval** — license and insurance photos with expiry dates,
  reviewed by an admin. Drivers are warned 30 days before expiry and lose
  approved-driver visibility when documents lapse.
- **Notifications** — in-app notification center plus email for offers,
  acceptances, messages (throttled), cancellations, reminders the day before
  and a few hours before, approvals, and more.
- **Messaging** — per-ride chat with realtime updates, unread badges, and
  admins can read conversations and post into them.
- **Accounts** — email/password or Google sign-in, invite links, friend codes,
  password reset, download-my-data, and account deletion.
- **Admin** — users, driver applications and renewals, organizations and
  membership approvals, safety reports, conversations, location stats, and an
  **impact report** (match rate, wait times, per-organization and monthly
  breakdowns, CSV export with no personal details).

## How access control works

The browser talks to Supabase directly with the public anon key, so **the
database is the security boundary**, not the app code:

- Row-level security policies and column-level grants live in
  `supabase/migrations/`. For example, users can't read each other's email or
  phone, can't approve themselves, and only see rides their visibility tier
  allows (`can_see_ride_request()`).
- Anything that crosses users (accepting an offer, check-ins, suspensions,
  notifications) runs in a **server action** with the service-role key, after
  the action checks who the caller is (`src/lib/auth.ts`).
- Every exported function in a `"use server"` file is a public endpoint.
  Helpers that must not be callable from the browser live in `src/lib/`
  (marked `server-only`).

`supabase/tests/policies.test.sql` checks these rules. Run it after changing
any policy.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase and Resend keys
npm run dev                  # http://localhost:3000
```

### Database

Migrations are plain SQL in `supabase/migrations/`, numbered in the order to
apply them. For a new Supabase project, run them all in order in the SQL
Editor (or with the Supabase CLI: `supabase db push`). For an existing
project, run only the ones you haven't applied yet.
`supabase/legacy/` holds old one-off scripts — **don't run them**.

To make the first admin, sign up normally, then in the SQL Editor:

```sql
update public.users set is_admin = true where email = 'you@example.org';
```

### Scheduled jobs

`/api/cron` (daily by default, see `vercel.json`; hourly recommended) expires stale rides, sends ride
reminders and "did your ride happen?" prompts, and handles driver document
expiry. It requires `CRON_SECRET`; see `WORK_QUEUE.md` for setup.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Apply all migrations to a throwaway Postgres and run the access-control tests (needs `psql` and a local Postgres superuser via `PG*` env vars) |
| `npm run check` | Lint + typecheck + unit tests |
| `npm run build` | Production build |

CI (`.github/workflows/ci.yml`) runs all of these on every pull request,
including the database tests against Postgres 16.

### Project layout

```
src/
  actions/      server actions (one file per area)
  app/          routes: (app) signed-in pages, (auth) sign-in pages,
                admin/, api/ (cron, data export, CSV), trip/ (public share link)
  components/   UI, grouped by feature
  lib/          server helpers: auth, email, notifications, rate limits,
                scheduled jobs, impact stats, time zone handling
supabase/
  migrations/   schema, policies, functions (apply in order)
  tests/        stand-in for Supabase + access-control tests
```

Ride dates and times are stored as local Wichita time (America/Chicago); use
the helpers in `src/lib/time.ts` rather than `new Date()` on them.
