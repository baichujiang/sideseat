# SideSeat MVP

SideSeat is a mobile-first web app for international students in Germany to meet classmates through shared courses and communicate in a low-pressure, privacy-respecting way.

The product principle is:

`shared context first, relationship second`

## Architecture Summary

- Frontend and backend live in one Next.js App Router app for a faster MVP with a cleaner deployment story.
- PostgreSQL + Prisma provide a relational schema that keeps courses, connections, messages, blocks, reports, and contact exchange flows consistent.
- Auth uses email/password plus secure, opaque, database-backed sessions stored in an `HttpOnly` cookie.
- Discovery is intentionally constrained to shared academic context: same course, major, or semester.
- Direct messaging uses the first-message flow: the sender's first message creates the 1:1 thread atomically (no approval step). Access requires at least one shared course, and a per-hour cap bounds abuse.
- Private contact info is hidden until contact exchange is explicitly requested and accepted.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- React Hook Form + Zod
- Prisma
- PostgreSQL
- bcryptjs for password hashing

## Project Structure

```text
.
├── app
│   ├── (auth)
│   │   ├── forgot-password/page.tsx
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── layout.tsx
│   ├── (app)
│   │   ├── connections/[connectionId]/page.tsx
│   │   ├── courses/[courseId]/page.tsx
│   │   ├── courses/add/page.tsx
│   │   ├── courses/page.tsx
│   │   ├── discover/page.tsx
│   │   ├── home/page.tsx
│   │   ├── inbox/page.tsx
│   │   ├── onboarding/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── settings/page.tsx
│   │   └── layout.tsx
│   ├── api
│   │   ├── auth/login/route.ts
│   │   ├── auth/logout/route.ts
│   │   ├── auth/signup/route.ts
│   │   ├── blocks/route.ts
│   │   ├── connections/[connectionId]/contact-exchange/route.ts
│   │   ├── connections/[connectionId]/end/route.ts
│   │   ├── connections/[connectionId]/messages/route.ts
│   │   ├── courses/[courseId]/route.ts
│   │   ├── courses/route.ts
│   │   ├── discover/route.ts
│   │   ├── connections/start/route.ts
│   │   ├── profile/route.ts
│   │   └── reports/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components
│   ├── cards
│   ├── forms
│   ├── inbox
│   ├── layout
│   └── ui
├── lib
│   ├── auth
│   ├── constants
│   ├── db
│   ├── queries
│   ├── validators
│   ├── http.ts
│   └── utils.ts
├── prisma
│   ├── schema.prisma
│   └── seed.ts
├── middleware.ts
├── package.json
└── .env.example
```

## Database Schema

Main models:

- `User`: profile, privacy preferences, optional private contact handles
- `Session`: opaque database-backed login sessions
- `Course`: shared academic context
- `UserCourse`: user-course membership plus per-course intention tags
- `Connection`: 1:1 thread metadata; `originCourseId` records the shared course context it was seeded from
- `Invitation` (legacy): pre-MVP approval gate; no longer written to, kept for historical rows and admin reads
- `Message`: lightweight plain-text chat
- `ContactExchangeRequest`: explicit private contact unlock flow
- `Block`: anti-harassment protection
- `Report`: moderation intake

See [prisma/schema.prisma](prisma/schema.prisma) for the full schema.

## API Design

### Auth

- `POST /api/auth/signup-email` — register with **email + password** (internal `username` is auto-allocated)
- `POST /api/auth/phone/send-otp` — send SMS signup code (`{ "phone": "…", "purpose": "signup" }`)
- `POST /api/auth/signup-phone` — register with **phone + SMS code + password**
- `POST /api/auth/signup` — legacy **username + password** signup (still supported for scripts / old clients)
- `POST /api/auth/login` — **username, email, or phone** + password

**SMS (production):** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`.  
If Twilio is not configured, **development** builds log the 6-digit code to the server console; **production** returns an error until Twilio is configured.

- `POST /api/auth/logout`
- `POST /api/student-verification/request`
- `GET /api/student-verification/verify?token=...`
- `PATCH /api/admin/verifications/:userId`

### Profile and Settings

- `PUT /api/profile`

### Courses and Discovery

- `GET /api/courses`
- `POST /api/courses`
- `DELETE /api/courses/:courseId`
- `GET /api/discover`

### Connections and Messages

- `POST /api/connections/start` — create a new 1:1 thread by sending the first message (first-message flow)
- `POST /api/connections/:connectionId/messages` — reply on an existing thread
- `POST /api/connections/:connectionId/contact-exchange`
- `POST /api/connections/:connectionId/end`

### Safety

- `POST /api/blocks`
- `POST /api/reports`
- `PATCH /api/admin/reports/:reportId`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env values:

```bash
cp .env.example .env
```

3. Start PostgreSQL locally and update `DATABASE_URL` in `.env`.

4. Generate Prisma client:

```bash
npm run prisma:generate
```

5. Create your initial schema:

```bash
npm run prisma:migrate -- --name init
```

6. Seed demo data:

```bash
npm run prisma:seed
```

7. Run the app:

```bash
npm run dev
```

8. Run the authenticated smoke test against the dev server:

```bash
npm run smoke:auth
```

## Demo Accounts

After seeding:

- `lin@example.com`
- `amira@example.com`
- `lucas@example.com`
- `yuna@example.com`

Password for all seeded users:

`Password123`

## Product Coverage by Phase

### Phase 1

- App scaffold
- Prisma schema
- Authentication
- Protected routes
- Onboarding/profile
- Course management
- Discovery through shared context
- Mobile-first shell and navigation
- Student verification status foundation

### Phase 2

- First-message chat flow (no invite gate; per-hour new-thread rate limit)
- Inbox
- Accepted connections

### Phase 3

- Lightweight text chat
- Contact exchange request flow
- End connection
- Block user
- Report user

### Phase 4

- Seed data
- README
- Deployment notes
- Basic moderation dashboard

## Deployment Notes

- Set `DATABASE_URL`, `SESSION_SECRET`, and `NEXT_PUBLIC_APP_URL` in your deployment environment.
- **Stripe tips (optional):** set `STRIPE_SECRET_KEY` (`sk_test_…` or `sk_live_…`) to enable the Me-page tip flow via Stripe Checkout. Use a public `NEXT_PUBLIC_APP_URL` so success/cancel redirects match your domain. See `DEPLOY.md` §2b for Dashboard steps.
- Set `ADMIN_EMAILS` to a comma-separated allowlist for moderation access.
- Set `RESEND_API_KEY` and `EMAIL_FROM` to enable real student verification emails. If they are missing, the app falls back to a local verification link for development.
- Student email auto-verification is currently restricted to a small Munich launch whitelist of officially confirmed domains. Other domains go to manual review.
- Lightweight anti-abuse signals are captured on signup, login, and first-message send: install ID, hashed IP, user agent, language, platform, timezone, and screen size. These are used as moderation hints rather than hard identity proof.
- Run Prisma migration during deploy or release step.
- Session cookies are configured as secure in production.
- For a production launch, add:
  - password reset email flow
  - admin moderation dashboard
  - stronger per-IP and per-account rate limiting
  - optional university email verification
  - audit logging for safety actions

## Notes

- This MVP intentionally does not include public feeds, random discovery, media messaging, typing indicators, or read receipts.
- If you later wrap this into iOS or Android shells, the current mobile-first web architecture is already suitable for a WebView-based first release.
# sideseat
