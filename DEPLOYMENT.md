# Production deployment

- Website: https://pannheu.vercel.app
- Original address (still supported): https://pannheu-uploader01.vercel.app
- Vercel project: `pannheu-uploader01`
- Supabase project: `pannheu-uploader01` (`sdsasujntwgidfcmwmgm`), Singapore
- Supabase project dashboard: https://supabase.com/dashboard/project/sdsasujntwgidfcmwmgm
- Deployment: `dpl_2iRvBN49BbvtgGrk2zeuXnRQcRYd`
- Application source revision: `14662c0`

Both SQL migrations are applied. The private uploads bucket has a 20 MB per-file limit; the database enforces the 800 MB shared quota. Guest management is enabled without registration. The `file-manager` Edge Function is deployed with explicit private browser-capability checks. The hourly `pannheu-hourly-cleanup` Cron job is active; its authorization secret is stored in Supabase Edge Function secrets and Vault. Supabase Auth and email are not required. Vercel deployment protection is disabled for this public application.

Production environment variables are configured in Vercel. Service-role and cleanup secrets are not included in the frontend or this repository.

Verified against the live backend: guest upload, actual stored size, byte-for-byte shared download, isolation of file lists and delete access between browser keys, link revocation, rejection of unauthorized cleanup, and permanent cleanup of the test object. The public production page returned HTTP 200 with the application. The test file was removed. Full interactive production browser validation was limited by the cloud machine's egress policy; the interface previously passed local Chromium smoke tests.

This deployment was uploaded through the Vercel API. GitHub auto-deployment is not configured. Subsequent source changes require another deployment or connecting the GitHub repository in Vercel settings.

The app uses Supabase Free; bandwidth, abuse controls, and current provider allowances still need monitoring. The 800 MB storage quota does not cap download traffic. See README.md for retention behavior, reservation accounting, and public-launch limitations.

## Interface refresh

The modern mobile-first interface is live on both domains. New links use `/s/TOKEN`; legacy query links still resolve. Local Chromium checks passed for responsive layout, navigation, keyboard-accessible dialogs, search, and offline fallback. A separate production-build integration test with mocked Supabase HTTP responses passed guest upload/completion, clipboard copying, browser-key persistence, deletion confirmation, new and legacy links, and expired-link rendering. Public HTTP checks confirmed the updated application on both domains and share routes, with no preview mode or Vercel login protection. The Supabase backend and retention settings were unchanged in this release.
