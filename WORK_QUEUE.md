# Work Queue

Things that need a person (accounts, settings, decisions) rather than code.
Check items off as they're done.

## To do

### 1. Set up a real email sending domain  ⟵ *you asked to keep this on the list*

Right now emails go out from Resend's test address (`onboarding@resend.dev`),
which **only delivers to the Resend account owner's own inbox** and tends to
land in spam. Until this is done, riders and drivers won't actually receive
offer, reminder, cancellation, password-reset, or safety emails.

- [ ] Pick a domain (e.g. `driveandthriveconnect.org`) or a subdomain of one
      you already own (e.g. `rides.yourorg.org`). A subdomain keeps ride
      emails separate from your main email reputation.
- [ ] In Resend → **Domains → Add domain**, enter it and add the DNS records
      Resend shows (SPF, DKIM, and the recommended DMARC) at your domain
      registrar. Wait for Resend to show **Verified**.
- [ ] In Vercel → Project → Settings → Environment Variables, set
      `EMAIL_FROM` to e.g. `Drive & Thrive Connect <rides@yourdomain.org>`
      and redeploy. (No code change needed.)
- [ ] In Supabase → Authentication → **SMTP Settings**, turn on custom SMTP
      using Resend's SMTP credentials and the same sender, so sign-up
      confirmation, password reset and admin invite emails come from you too
      (Supabase's built-in sender is limited to a few emails per hour).
- [ ] Send yourself a test: request a password reset and post a test ride.

### 2. Apply the new database migrations
- [ ] In Supabase → SQL Editor, run `supabase/migrations/00009_security_hardening.sql`,
      then `00010_platform_features.sql` (in that order, each once).
      **Deploy the app code first, then run both migrations right away** —
      until they run, the new app can't post rides (and the old app can't
      read them after), so do it at a quiet time and don't leave a gap.
- [ ] In Supabase → Storage, confirm a private bucket named `vetting-docs`
      exists (the migration creates it; create it manually if not, with
      "Public bucket" **off**).
- [ ] Check **Database → Replication** that `messages` is enabled for
      Realtime (live chat).

### 3. Turn on the scheduled jobs (reminders, ride expiry, license expiry)
- [ ] In Vercel, add a `CRON_SECRET` environment variable (any long random
      string) and redeploy. `vercel.json` schedules `/api/cron` hourly.
- [ ] **If you're on Vercel's free Hobby plan**, cron jobs can only run once
      a day, so "ride in a few hours" reminders would be late. Either upgrade
      to Pro, or use a free external scheduler (e.g. cron-job.org) to call
      `https://<your-app>/api/cron` hourly with the header
      `Authorization: Bearer <CRON_SECRET>`.

### 4. Supabase auth settings
- [ ] Authentication → URL Configuration: set **Site URL** to your production
      URL and add `https://<your-app>/auth/callback` to **Redirect URLs**
      (needed for password reset, email confirmation and admin invites).

### 5. Re-review existing approved drivers
Drivers approved before this update never uploaded documents. They keep
working, but have no expiry date on file, so the app can't warn them.
- [ ] Ask each approved driver to upload their license and insurance on the
      **Approved Driver** page (it accepts renewals from approved drivers
      whose documents are missing).

### 6. Review organizations
- [ ] Admin → **Orgs**: check the list migrated correctly. Any "Other: …"
      write-ins from signup were brought over as **inactive** organizations —
      activate the real ones, and leave the rest inactive.

## Later / nice to have

- [ ] **Error monitoring** — sign up for Sentry (free tier) and wire it into
      `src/lib/log.ts` so crashes and failed emails alert you instead of only
      appearing in Vercel's logs.
- [ ] **Phone number verification by text** — needs an SMS provider (e.g.
      Twilio, ~$0.01/text). Phone numbers are format-checked today, not
      verified.
- [ ] **Text-message notifications** — same SMS provider; many riders may
      check texts more reliably than email.
- [ ] **Background checks** — the app is clear that approval is a document
      review, not a background check. If partners want real checks, that's a
      paid service (e.g. Checkr) and a policy decision.
- [ ] **Privacy policy & terms** — the app now stores ID documents and phone
      numbers; have a lawyer or your partner orgs review what you tell users.
- [ ] **Backups** — confirm Supabase point-in-time recovery or daily backups
      are on for your plan.

## Done
- [x] Security hardening (admin self-promotion, vetting bypass, forced
      connections, private data exposure) — migration `00009`.
