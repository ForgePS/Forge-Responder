# Staging environment

Staging is a separate Firebase project, **forge-rms-staging**, with fake data only.
Use it to try database rules, server functions and data migrations before production.

- Site: https://forge-rms-staging.web.app (an orange **Staging** badge shows on every screen)
- Test departments: `/staging-east` (Standard plan, active) and `/staging-west` (Pilot plan, trial)
- Email and text messages are **never sent** from staging; they are written to the function logs
  (`functions/.env.forge-rms-staging`: `EMAIL_DELIVERY=log`, `SMS_DELIVERY=log`).

## How each piece knows which project it is on

| Piece | Production | Staging |
|---|---|---|
| Firebase CLI alias | `--project prod` | `--project staging` (`.firebaserc`) |
| Website build | `vite build` (`.env`, `.env.production`) | `vite build --mode staging` (`.env.staging`) |
| Hosting deploy | builds for the target project automatically (`scripts/build-for-project.mjs`, hosting predeploy) | same |
| Function settings | `functions/.env` | `functions/.env.forge-rms-staging` |

## One-time setup (Firebase console, forge-rms-staging)

1. **Billing:** Upgrade to the Blaze (pay-as-you-go) plan. Functions and Storage require it. Add a budget alert (e.g. $5).
2. **Firestore:** Build > Firestore Database > Create database, Native mode, location **nam5 (United States)** like production.
3. **Storage:** Build > Storage > Get started (same location).
4. **Authentication:** Build > Authentication > Get started, enable **Email/Password**, then Settings > upgrade to **Identity Platform**.
5. Switch on authenticator codes for staging creators:
   `$env:GOOGLE_CLOUD_PROJECT = "forge-rms-staging"; node scripts/two-factor.mjs --enable-totp`

Then (done once by Claude/CLI): create placeholder function secrets, deploy, and seed.

## Everyday use

```bash
# Deploy everything to staging (website is built for staging automatically)
npm run deploy:staging

# Refill the fake data (safe to repeat; refuses to touch production)
$env:GOOGLE_CLOUD_PROJECT = "forge-rms-staging"; node scripts/seed-staging.mjs '--creator-email=you@example.com' *> staging-seed.txt
```

`staging-seed.txt` holds the passwords of any newly created test logins; it is gitignored.
Your creator login on staging is a separate account from production: set its password with
"Forgot password" if you don't use the one printed by the seed.

## Suggested routine for risky changes

1. Run the tests (`npm test`) and the local emulator check.
2. `npm run deploy:staging`, then click through the affected pages on staging.
3. Only then deploy to production.
