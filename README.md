# បញ្ញើ · Pannheu

Mobile-first Khmer file sharing with Next.js, Supabase, and Vercel. Hanuman is the default font; the language button switches the interface between Khmer and English. Technical backend errors may be returned in English.

## Run locally

Node.js 22 or newer recommended.

```sh
npm ci
cp .env.example .env.local
# Set your Supabase project URL and public anon key in .env.local.
npm run dev
```

Without Supabase configuration the app displays a labeled design preview with sample files. It never pretends uploads succeeded. Build with `npm run build`; run production with `npm start`. Existing cloud tasks are isolated: use this checkout, without creating a worktree.

## Connect Supabase

1. Create a Supabase Free project. Check its current storage, egress, function and database limits. The application cap is 800,000,000 bytes across all visitors; this does not cap bandwidth or ensure unlimited free downloads.
2. Apply both files in `supabase/migrations/` in filename order using the Supabase SQL editor, or link the project with the Supabase CLI and run `supabase db push`.
3. Deploy the function: `supabase functions deploy file-manager`. Its JWT gateway check is disabled in `supabase/config.toml` to support public download links; upload/list/delete requests validate a private browser capability inside the function. Only its SHA-256 hash is stored in Postgres. The service-role key stays in the Edge Function, never in Next.js public variables.
4. No Supabase Auth setup is needed. Visitors do not register or log in. A cryptographically random private key in localStorage controls their file list and deletion; it is never included in sharing links. Clearing browser data or changing browsers loses management access. Existing account-owned uploads remain stored but are not assigned to new guests.
5. Generate a strong cleanup secret and set it securely with `supabase secrets set CLEANUP_SECRET=...`. Never use the service-role key as this secret. Configure the hourly job below.
6. In the Supabase dashboard, enable the Cron, pg_net, and Vault extensions. Save the function URL as a Vault secret named `pannheu_cleanup_url`, and the same cleanup secret as `pannheu_cleanup_secret`. Create the job using this SQL:

```sql
select cron.schedule('pannheu-hourly-cleanup', '0 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'pannheu_cleanup_url'),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pannheu_cleanup_secret')
    ),
    body := '{"action":"cleanup"}'::jsonb
  );
$$);
```

The function URL is `https://YOUR_PROJECT.supabase.co/functions/v1/file-manager`. Keep secret values out of version control. Check job history and HTTP responses after setup; creating the schedule alone does not prove it runs.

## Storage behavior

- Private bucket, max 20,000,000 bytes per object. No client storage access policies.
- Every reservation temporarily counts the full 20 MB bucket limit, preventing a client from understating size to exceed the global cap. Completion verifies the actual object size. The full reservation remains charged for 3 hours, then usage reflects actual size.
- A database advisory lock serializes reservations. The global sum includes pending and deleting records.
- Expired files are deleted first; oldest ready files are removed when a new reservation needs space. Links explicitly disclose early removal. Files expire after 3 days.
- Interrupted uploads keep their reservation for at least 3 hours because signed upload URLs remain valid for 2 hours. The cleanup job removes abandoned uploads after that period.
- Deleting a newly uploaded file immediately disables sharing but retains the object and quota for up to 3 hours, until its upload URL is unusable. This prevents deleted paths from being reuploaded outside quota. Older objects are removed through the Storage API before database records are deleted. Failed deletion retains quota and can be retried. Pending uploads cannot be immediately deleted safely while their URL is valid.
- Only the browser holding the private management key can list or delete its uploads. Direct table access is disabled. Public share resolution requires an unpredictable 192-bit token. Downloads use 60-second signed attachment URLs.
- Maximum 10 retained upload records per browser key per hour. This is a basic guard, not comprehensive abuse prevention. Public download rate limiting, malware scanning, CAPTCHA, abuse reporting, and a bandwidth circuit breaker are not implemented; add these before an unrestricted public launch. Visitors can reset browser keys, so this guard is not a reliable per-person rate limit.
- Hanuman and DM Sans load from Google Fonts. PWA caches only a static offline notice, never files or signed URLs. Transfers require a connection. Background transfers are not supported.

## Deploy to Vercel

Import this repository, select the Next.js preset, and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No email provider or Auth redirect configuration is required. No Supabase service-role key belongs in Vercel public variables. Supabase hosts the cleanup job; Vercel Cron is not needed.

## Browser smoke test

With the app running in preview mode (no Supabase variables), run `npm test`. It uses Playwright with `/usr/bin/chromium`; override `CHROMIUM_PATH` and `TEST_BASE_URL` if needed. It exercises rendering, search, language switching, mobile overflow, guest information, configuration errors, and offline fallback. It does not validate a live Supabase project.

## Verify a connected deployment

1. Without signing in, upload a small file, and verify its displayed size and quota.
2. Open its sharing link in a separate browser and download; compare the bytes.
3. Confirm a different browser key cannot list, complete, or delete another browser’s uploads, and that public share tokens cannot perform management operations.
4. Delete a file and verify both the object and public link are gone.
5. In a test project, expire a file, invoke cleanup with the cleanup secret, and verify removal.
6. Exercise concurrent reservations near 800 MB and verify rejected uploads do not exceed quota. Test abandoned upload cleanup after signed URLs have expired.
7. Check mobile layout, installability over HTTPS, and the offline notice. Browser PWA installation support varies; SVG and PNG application icons are included.

The checked-in application can build without credentials. Real upload, cron execution, and download require the configured Supabase project and must be verified there.

## Sharing links and interface

The redesigned interface focuses on Send a file and My files, with touch-sized controls, upload progress, delete confirmation, keyboard-accessible dialogs, and loading/expired download states. New sharing links use `/s/TOKEN`; legacy `/?share=TOKEN` links remain supported. Both routes retain the full unpredictable token.

Run `npm run test:guest` for a browser integration test with a mocked Supabase HTTP backend. It builds a separate test app in `.next-guest-test` and starts a production server on port 3012 and verifies the guest upload/complete flow, persistent management keys, clean and legacy links, copy feedback, and delete confirmation. This is separate from live Supabase verification.
