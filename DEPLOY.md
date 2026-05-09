# Deploy SideSeat to Vercel + Neon + sideseat.de

End-to-end path from a local repo to a production URL at `https://sideseat.de`.
Budget ~20 minutes.

## 0. One-time: push the repo to GitHub

```bash
cd ClassLink
git init
git add .
git commit -m "Initial public deploy"
# Create an empty repo on github.com (private is fine), then:
git remote add origin git@github.com:<you>/sideseat.git
git branch -M main
git push -u origin main
```

Check `prisma/migrations/` is committed and `.env` is NOT.

## 1. Create a managed Postgres (Neon free tier)

1. Sign in at [neon.tech](https://neon.tech) with GitHub.
2. Create a new project in **eu-central-1** (close to your domain region).
3. Dashboard → Connection string → copy the **Pooled connection** string.
   - It looks like `postgresql://user:pwd@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
4. You'll paste this into Vercel as `DATABASE_URL`.

## 2. Import into Vercel

1. [vercel.com/new](https://vercel.com/new) → Import the GitHub repo.
2. **Root Directory**: `ClassLink` (if the repo root isn't `ClassLink` itself).
3. Framework preset: **Next.js** (auto-detected).
4. Build command: leave as default — `package.json` already runs
   `prisma migrate deploy && next build` via the `build` script.
5. **Environment Variables** (Production + Preview):
   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled connection string |
   | `SESSION_SECRET` | `openssl rand -base64 48` output |
   | `NEXT_PUBLIC_APP_URL` | `https://sideseat.de` |
   | `ADMIN_EMAILS` | your login email, comma-separated |
   | `RESEND_API_KEY` | existing `re_...` key |
   | `EMAIL_FROM` | `SideSeat <noreply@sideseat.de>` |
   | `STRIPE_SECRET_KEY` | optional — `sk_live_…` for tips on Me (see §2b) |
6. Deploy. First build installs deps → `postinstall` runs `prisma generate` →
   `build` runs `prisma migrate deploy` against Neon → Next builds. Done.

## 2b. Stripe tips (optional)

Voluntary tips use **Stripe Checkout** (`app/api/tip/checkout/route.ts`). The Me page only shows the tip card when `STRIPE_SECRET_KEY` is set.

1. **Create or open a Stripe account** at [dashboard.stripe.com](https://dashboard.stripe.com).
2. **Developers → API keys**  
   - For Vercel **Preview** / local dev: use **Test mode** and copy the **Secret key** (`sk_test_…`).  
   - For **Production**: switch to **Live mode** and copy the **Secret key** (`sk_live_…`).
3. In **Vercel → Project → Settings → Environment Variables**, add:
   | Key | Environment | Value |
   | --- | --- | --- |
   | `STRIPE_SECRET_KEY` | Production | `sk_live_…` |
   | `STRIPE_SECRET_KEY` | Preview (optional) | `sk_test_…` so previews can test checkout |
4. Keep **`NEXT_PUBLIC_APP_URL`** set to your real public URL (e.g. `https://sideseat.de`). Checkout **success** and **cancel** URLs are built from this origin so users return to the right host after payment.
5. Redeploy so the new env vars are available at build/runtime.

**Local:** copy `.env.example` to `.env`, set `STRIPE_SECRET_KEY=sk_test_…` and `NEXT_PUBLIC_APP_URL=http://localhost:3000`, run `npm run dev`, open `/profile`, and complete checkout with test card `4242 4242 4242 4242`.

**Note:** Webhooks (`checkout.session.completed`) are not wired yet; success today is driven by the redirect back to `/profile?tip=success`. For production-grade confirmation and ledgering, add a webhook endpoint and `STRIPE_WEBHOOK_SECRET` later.

## 3. Connect sideseat.de

1. Vercel project → Settings → Domains → Add `sideseat.de` and `www.sideseat.de`.
2. Vercel prints the DNS values it wants. At your registrar set:
   - `sideseat.de`  → `A` record → `76.76.21.21` (or the CNAME Vercel shows)
   - `www.sideseat.de` → `CNAME` → `cname.vercel-dns.com.`
3. **Do not remove** the existing Resend records (`resend._domainkey`, `send`
   MX/TXT, `_dmarc`) — they're independent from the web hosting.
4. Wait for Vercel's green "Valid Configuration" check (usually 1–5 min).

## 4. Seed (optional)

If you want the sample TUM users/courses in prod, from your laptop with the
Neon connection string exported:

```bash
DATABASE_URL="<neon-pooled-url>" npx tsx prisma/seed.ts
```

## 5. Smoke test

1. Visit `https://sideseat.de/signup`, create an account.
2. Go to `/profile`, trigger student verification with `your.name@tum.de`.
3. Email should arrive now — the embedded link will be
   `https://sideseat.de/api/student-verification/verify?token=…` (no more
   localhost → no more TUM bounce).
4. If Resend still reports `bounced` for a specific address, check the
   dashboard event log for the real SMTP response.

## 6. Known limitations after first deploy

- **Avatar uploads are disabled** on Vercel (read-only FS). The API route
  detects the serverless environment and returns a friendly error. To enable,
  wire up Vercel Blob or S3/R2 and replace `writeFile` in
  `app/api/profile/avatar/route.ts`. Set `AVATAR_STORAGE=local` only in
  self-hosted deployments with persistent disk.
- **Student verification** still only works for TUM right now by design.
- **Password reset** is a placeholder; contact support or manual DB reset.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build fails on `prisma generate` | Confirm `DATABASE_URL` is set for the Build step, not just runtime. |
| 500s on cold start, log mentions `Can't reach database` | You used the **direct** Neon URL instead of the **pooled** one. Swap it. |
| Emails sent to TUM still bounce | Check `NEXT_PUBLIC_APP_URL` is `https://sideseat.de` (not localhost, not a Vercel preview URL). Preview deploys intentionally skip sending. |
| Tip checkout 503 “not enabled” | `STRIPE_SECRET_KEY` missing in that environment — add it and redeploy. |
| After Stripe pay, wrong site or 404 on return | `NEXT_PUBLIC_APP_URL` must match the URL users open in the browser (no trailing slash). |
| DMARC report complaints | Add `rua=mailto:dmarc@sideseat.de` to the existing `_dmarc` record. |
