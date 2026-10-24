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


## Published-product and decision workflow

- The platform only exposes lender and insurance products when both the product is published and its partner organization is verified and published.
- Riders can choose a published product when submitting an application/quote. A general un-routed request is visible only to platform operations and is not routed to an individual lender/insurer.
- Lender partners can issue an offer containing principal, interest rate basis, fees, total repayment, term, frequency, and expiry. The rider can accept or decline the offer. Acceptance records the applicant decision; it does not disburse funds.
- Insurer partners can issue a quote with premium, coverage duration, structured written terms/exclusions, and an expiry. Riders can accept/decline the issued quote. Acceptance creates a policy record in `awaiting_payment`; it does not activate cover.
- Every partner action requires an authenticated profile, active account, verified organization, and active partner membership and is written to `audit_logs`.
- A trusted admin must create/verify partner organizations, assign membership roles, and approve/publish products. Never enable partner roles from public signup metadata.


## First platform administrator (one-time bootstrap)

The signup trigger deliberately creates new accounts as `rider`. There is no public endpoint or signup metadata field that can create a platform administrator.

1. Create a normal account using the intended administrative email and confirm it.
2. In Supabase Dashboard, inspect `auth.users` to obtain the exact UUID for that confirmed account.
3. In SQL Editor, update the one reviewed profile by UUID. Replace the placeholder with the verified UUID, not an email supplied by a request:

```sql
begin;

update public.profiles
set role = 'platform_admin',
    account_status = 'active',
    updated_at = now()
where id = 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID';

-- Verify exactly one row was updated before committing.
select id, full_name, role, account_status
from public.profiles
where id = 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID';

commit;
```

4. Sign out and back in so the web app refreshes the protected profile role.
5. Assign all further staff/partner roles from the platform operations workspace. The UI does not provide a way to assign a platform-admin role.
6. Record who authorized the first bootstrap in your organization's external change log. Review the audit log after all subsequent changes.

Do not run the bootstrap snippet with a UUID you have not verified. Use a separate admin account for day-to-day operations where possible, enable MFA for privileged accounts, and rotate access if staff leave.

## Partner operations and product publishing

- Create a partner organization with its full legal identity. It starts in `pending_verification`.
- Verify the organization through a trusted evidence review. Publish it only when it is authorized to appear in the rider catalog.
- Assign a role matching the organization type. Memberships assigned before verification remain pending; the review workflow activates matching pending memberships after the organization is verified.
- Create loan/insurance product drafts. Drafts are not visible to riders.
- Publish a product only after checking official pricing, total repayment/fees or coverage terms/exclusions, eligibility, validity dates, and partner authority.
- Product publishing is audited and requires a verified, published organization.


## Financial operations and status notifications

- Rider support replies use the `partner-operations` Edge Function. The function checks ticket ownership/assignment, rejects replies to resolved or closed tickets, inserts the message, updates ticket status, writes an audit event, and creates a notification. Direct authenticated INSERT on `support_messages` is intentionally not granted.
- Lenders should record the repayment schedule from their approved/core-system schedule after the external disbursement is confirmed. The Edge Function validates dates and non-negative amounts, then checks that total principal, fees, and total repayment match the accepted offer before inserting installments.
- A loan cannot be marked active by the partner workflow until at least one repayment installment has been recorded. This is a completeness gate, not a calculation engine.
- Insurance quote acceptance creates only an `awaiting_payment` policy record. To record active coverage, an authorized insurer operator must independently verify policy issuance, enter the actual insurer policy/reference and coverage dates, and supply a separate external payment confirmation reference. MotoSave does not process the payment and the UI must not be described as proof of coverage.
- Lender offer, application, insurer quote, claim, policy, document-review, support-ticket, and repayment-schedule state changes produce account notifications when the notification insert succeeds. A failed notification insert does not roll back a verified partner action; check the returned `notification_created` field and operational logs.
- Do not connect demo/sample records to a real payment provider or insurer workflow. Keep official provider credentials server-side and complete provider-specific verification before any production integration.


## Netlify frontend configuration

The repository includes `netlify.toml` for the Vite frontend. Configure these site environment variables in the new MotoSave Netlify site before deploying:

- `VITE_SUPABASE_URL`: URL of the dedicated MotoSave Supabase project.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: that project’s publishable key. This is intentionally public and must be protected by RLS; do not use a service-role or secret key here.

Build command: `npm run build:web`. Publish directory: `apps/web/dist`. The SPA fallback is configured for Vite. Set the Edge Function secret `MOTOSAVE_ALLOWED_ORIGIN` to the exact production origin, for example `https://your-motosave-domain.example`, before using partner operations.

Do not deploy the frontend as a claimed live financial service until the matching MotoSave database migration and Edge Functions are deployed to the same dedicated Supabase project and partner/provider workflows are verified. The existing Murama school site/project is unrelated and must not be reused for MotoSave.
