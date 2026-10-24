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


## Deploy partner operations

The partner console calls a server-side Edge Function. It is not a direct browser write into privileged tables.

1. Apply the database migration first.
2. Set a strict browser origin for your deployment. Example for a production host: `supabase secrets set MOTOSAVE_ALLOWED_ORIGIN=https://your-verified-domain.example`. Use the actual domain, not the example.
3. Deploy the function: `supabase functions deploy partner-operations`.
4. Review the Edge Function logs and test with separate rider, lender, insurer, support, and admin identities.
5. The signed-in user's profile role and active partner membership must be assigned by a trusted administrator. Signup metadata cannot elevate a role.
6. Test that a lender cannot load or change another lender's applications, an insurer cannot change another insurer's policies or claims, and a rider cannot invoke any privileged operation.
7. Review audit_logs after every status change. The console does not contact any payment provider, lender core system, or insurer API on your behalf.

Partner roles are intentionally not self-service. Activate a partner organization only after verifying the legal entity and appropriate authorization. A policy record should only be marked active after the issuing insurer's own issuance record has been independently confirmed.
