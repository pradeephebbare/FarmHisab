# FarmHisab

FarmHisab is a mobile-first farm ledger in English and Kannada. The landowner manages the account and records expenses for either the landowner or the farmer. The farmer does not need an account or use the app.

The app tracks expenses and crop income, keeps receipt photos in private storage, and shows separate landowner and farmer expense totals.

## Technology

- Next.js 15 App Router and TypeScript
- Supabase Auth, Postgres, Row Level Security, and private Storage
- Tailwind CSS, React Hook Form, and Zod

## Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run these migrations in order:
	- `supabase/migrations/0001_schema.sql`
	- `supabase/migrations/0002_functions.sql`
	- `supabase/migrations/0003_storage.sql`
	- `supabase/migrations/0004_landowner_expenses.sql`
	- `supabase/migrations/0005_landowner_farmer_expense_totals.sql`
3. In Authentication settings, enable email sign-in. Set the Site URL to your app URL and add its `/auth/callback` route to Redirect URLs. For local development, use `http://localhost:3000` and `http://localhost:3000/auth/callback`.
4. Email confirmation is recommended for production. Configure a custom SMTP provider before real users; Supabase's default email sender is rate limited.

The landowner's account creates the farm and manages all entries. Farmer expenses are a classification on each expense and do not require a farmer login. The app does not currently provide phone OTP, CSV/PDF export, or sales document PDFs.

## Run locally

Requirements: Node.js 18.18 or newer and npm.

```sh
cp .env.example .env.local
```

Edit `.env.local` and enter the Supabase project URL and anon/publishable key. Set the site URL to `http://localhost:3000`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then install dependencies, check the code, run tests, and start the development server:

```sh
npm install
npm run typecheck
npm test
npm run dev
```

Open `http://localhost:3000`. Never commit `.env.local` or other files containing real credentials.

## Deploy

Deploy to Vercel or another Next.js host. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` in the hosting environment. No Supabase service-role key is used by the app.

## Data and security

- Monetary values are stored as integer paise. Settlement calculations live in `src/lib/settlement.ts` and are covered by unit tests.
- Database writes use PostgreSQL `SECURITY DEFINER` functions; client table access is governed by Row Level Security.
- Expense changes are audited. Corrected expenses retain history, and reversed expenses remain visible but are excluded from totals.
- Receipt images use a private Storage bucket and short-lived signed URLs.
- Unsent expense and income forms are saved as drafts in browser local storage. Drafts are not shared records and are not synchronized automatically.

## Verification and limitations

Run `npm run typecheck` and `npm test` before deploying. The SQL migrations have not been tested against a live Supabase database in this repository environment. Review Kannada wording with a native speaker before production use. Automated end-to-end and database policy tests are not yet included.
