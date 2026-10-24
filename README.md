# MotoSave

MotoSave is a mobile-first financial wellbeing platform for motorcycle taxi riders in Rwanda. It combines a responsive web application and an Expo mobile application on the same Supabase Auth and PostgreSQL backend.

**Design direction:** light theme, modern blue palette, and Gopher-first typography. Gopher is a commercial typeface; the repository references the font family but does not redistribute font files. Add properly licensed font assets using the instructions in docs/FONTS.md.

## Current implementation scope

- Responsive React + TypeScript web workspace for dashboard, savings goals, motorcycle records, financing applications, insurance quote requests, activity, support, and settings.
- Expo React Native application with Supabase authentication and shared-backend screens for dashboard, savings goals and contribution history, motorcycles and maintenance logs, private document upload, financing applications, insurance quotes and claims, profile settings, notifications, and support tickets.
- Partner operations console backed by a role-checked Edge Function for lender queues/offers, insurer quote/claim/policy workflows, and support-ticket assignment. Riders can review and accept/decline issued loan offers and insurance quotes; offer/quote acceptance never moves funds or activates cover by itself. Operational changes are audit logged and require an authorized role.
- Supabase PostgreSQL migration with profiles, motorcycles, savings goals and manual entries, loan applications/offers/installments, insurance products/quotes/policies/premiums/claims, notifications, partner records, support, audit records, and private document storage policies.
- Row Level Security (RLS) and restrictive column grants for user-editable fields.
- Explicit demo mode when Supabase client variables are absent. Demo data is fictional and stored locally in the browser; it is not real money, a bank balance, a loan offer, a payment, or insurance coverage.
- A sandbox-only payment Edge Function that is disabled by default.
- A partner operations Edge Function that uses service-role access only after checking the authenticated user's profile role, active partner membership, partner type, and verified organization status.

## Important: backend connection is not included

No Supabase project credentials are committed. Create or select a Supabase project, apply the migration in supabase/migrations/, then add the same project URL and publishable key to both apps. The web and mobile apps will share the same Auth users, database records, and RLS policies.

### 1. Requirements

- Node.js 22 or newer
- npm 10 or newer
- A Supabase project for connected mode
- Expo Go or an Android emulator for mobile testing

### 2. Install dependencies

From the repository root:

    npm install

### 3. Start the web app

Copy the root environment template to .env.local and enter the Supabase project URL and publishable key:

    Copy-Item .env.example .env.local
    npm run dev:web

When no valid web Supabase values are configured, the web client opens in clearly labelled demo mode. Local demo changes are persisted in the browser and do not reach a server.

### 4. Connect Supabase

1. Create a Supabase project in the correct organization and region for your data-residency and latency requirements.
2. Open the Supabase SQL Editor and run the complete migration from supabase/migrations/202610240001_motosave_core.sql.
3. Confirm the migration finishes successfully and review the project's Security Advisor.
4. Configure Auth providers, redirect URLs, email verification, rate limits, backup policy, and production settings.
5. Copy the project URL and publishable key into the web and mobile environment variables. Never expose the service-role key to either client.
6. Add a licensed Gopher font file as described in docs/FONTS.md.

### 5. Start the mobile app

Create apps/mobile/.env using apps/mobile/.env.example and add the same Supabase URL and publishable key.

    npm run dev:mobile

Use Expo Go to scan the development QR code or run the Android emulator. Mobile and web authenticate independently but read and write the same Supabase project.

### 6. Checks

    npm run typecheck
    npm run build:web

The web build and TypeScript checks are also configured in GitHub Actions. Run dependency and security updates before production release.

## Financial and regulatory boundaries

MotoSave is not, by itself, a licensed deposit-taking institution, lender, insurer, or payment service. The current source provides application workflows and integration boundaries; it does not connect a real payment provider, issue a real policy, move funds, approve lending, or guarantee eligibility. Real-money functionality must remain disabled until the appropriate licensed providers, contracts, regulator/legal review, authenticated callbacks, reconciliation, and operational support are in place.

Savings goals and manually entered contributions are planning records. They are not deposits. Loan application status is not a credit decision. An insurance quote request is not an insurance contract. A payment intent is not proof of payment or active coverage.

## Repository map

- apps/web: responsive browser app.
- apps/mobile: Expo React Native app.
- supabase/migrations: database schema, RLS, grants, triggers, and storage policies.
- supabase/functions: partner operations and a disabled-by-default demo payment flow.
- docs: architecture, typography licensing, and go-live checks.

See docs/GO_LIVE_CHECKLIST.md before handling any real personal or financial data.
