# Supabase setup and shared backend

The browser and mobile clients use the same Supabase project URL and publishable key. Each user's identity is handled by Supabase Auth. Database records are protected by PostgreSQL Row Level Security, not by frontend navigation alone.

## Create the project

1. Create/select a Supabase project in the organization and region you intend to use.
2. In SQL Editor, apply supabase/migrations/202610240001_motosave_core.sql.
3. Copy the project URL and publishable key from the Connect panel.
4. Place them in the root .env.local for web and apps/mobile/.env for Expo, using the matching example files.
5. Enable email confirmation and configure production redirect URLs, password policy, rate limits, MFA for privileged users, backup, and monitoring.
6. Run Security Advisor and Performance Advisor. Review every warning instead of ignoring it.
7. Create a separate staging project; don't test migrations against production first.

## What the clients are allowed to do

Client writes are limited to rider-owned, user-submitted workflows: permitted profile fields, motorcycle records, savings goals, manual unverified contribution entries, loan applications, insurance quote requests, claims, support tickets, and notification read state. The SQL intentionally prevents clients from setting verified-payment flags, lender decisions, premium confirmation, policy coverage state, account roles, and privileged audit records.

Partner/admin workflows need trusted Edge Functions that check verified user identity, role, organization scope, and relevant state transitions. Do not assign admin roles through user-editable signup metadata.

## Demo payment function

demo-payment is only a simulator and is disabled unless MOTOSAVE_DEMO_PAYMENTS_ENABLED=true in a non-production environment. Never enable it in production. It does not contact a provider or move real funds. Live payments require a separate official provider adapter, secured provider callbacks, idempotency, reconciliation, an operating agreement, and legal/regulatory review.
