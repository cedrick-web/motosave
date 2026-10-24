# MotoSave architecture

## One backend, two clients

The browser app (React/Vite) and the Android/iOS app (Expo React Native) connect to the same Supabase project using the project's URL and publishable key. Supabase Auth provides identity; PostgreSQL stores business records; Row Level Security determines which records the signed-in user can access; Supabase Storage holds private user documents.

The publishable key is not a secret. A service-role/secret key bypasses RLS and must exist only in trusted server-side environments such as Supabase Edge Functions. Never place it in Vite or Expo public environment variables.

## Security model

- New users receive the rider role from a database trigger. Signup metadata cannot choose an elevated role.
- Role and account-status columns are excluded from client update grants.
- Riders can read only their own profile, motorcycle, goal, savings-entry, application, policy, installment, notification, and support records.
- Manually entered contributions are not provider-verified transactions.
- Partner products marked published can be browsed; draft or disabled products are not publicly visible.
- Partner/admin operational operations must be implemented through trusted Edge Functions with server-side identity, role, and organization checks.
- Private documents are scoped to a folder named for the authenticated user's UUID.
- Financial records are read-only from the client once recorded. Provider confirmation, reversals, reconciliation, and policy status changes must be performed by trusted services.

## Main data domains

Identity and access: profiles, partner_organizations, partner_memberships.

Rider asset management: motorcycles, motorcycle_documents, maintenance_records.

Savings: savings_goals, savings_transactions.

Credit: loan_products, loan_applications, loan_offers, repayment_installments.

Insurance: insurance_products, insurance_quote_requests, insurance_policies, insurance_premium_installments, insurance_claims.

Operations: payment_transactions, notifications, support_tickets, support_messages, audit_logs.

## Environment separation

Use separate Supabase projects for development/staging and production. Do not enable simulated payment workflows in production. Provider integrations must be implemented behind adapters and follow the relevant provider's official API and callback-signature contract. No live provider is assumed by this codebase.
