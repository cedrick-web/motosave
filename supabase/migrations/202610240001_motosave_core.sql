-- MotoSave core schema. Apply once to a Supabase project after reviewing the environment.
-- Security posture: RLS is enabled throughout public; client grants intentionally exclude partner-controlled
-- statuses, provider confirmations, role assignments, and payment-writing permissions.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_url text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'rw')),
  role text not null default 'rider' check (role in ('rider','cooperative_officer','lender_officer','insurer_officer','support_agent','platform_admin','analyst','auditor')),
  account_status text not null default 'active' check (account_status in ('pending','active','restricted','suspended','deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_phone_not_empty check (phone is null or length(trim(phone)) >= 7)
);

create table if not exists public.partner_organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  partner_type text not null check (partner_type in ('cooperative','lender','insurer','payment_provider','service_provider')),
  public_contact text,
  status text not null default 'pending_verification' check (status in ('pending_verification','verified','suspended','rejected')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.partner_organizations(id) on delete cascade,
  partner_role text not null check (partner_role in ('cooperative_officer','lender_officer','insurer_officer','support_agent','auditor')),
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table if not exists public.motorcycles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  registration_number text not null,
  make text not null,
  model text not null,
  model_year integer check (model_year is null or model_year between 1980 and 2100),
  vehicle_type text not null default 'petrol' check (vehicle_type in ('petrol','electric','hybrid','other')),
  ownership_status text not null default 'owned' check (ownership_status in ('owned','financed','rented','cooperative','other')),
  is_electric boolean not null default false,
  notes text,
  status text not null default 'active' check (status in ('active','inactive','sold','written_off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, registration_number)
);

create table if not exists public.motorcycle_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  motorcycle_id uuid not null references public.motorcycles(id) on delete cascade,
  document_type text not null check (document_type in ('registration','insurance','inspection','ownership','other')),
  storage_path text not null check (split_part(storage_path, '/', 1) = owner_id::text),
  expires_on date,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending_review','verified','rejected','expired')),
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  motorcycle_id uuid not null references public.motorcycles(id) on delete cascade,
  service_date date not null default current_date,
  description text not null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  next_service_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 120),
  purpose text not null default 'custom' check (purpose in ('emergency','maintenance','ownership','insurance','business','custom')),
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date,
  contribution_frequency text not null default 'flexible' check (contribution_frequency in ('flexible','daily','weekly','monthly')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'active' check (status in ('active','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid references public.savings_goals(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  note text,
  source text not null default 'manual' check (source in ('manual','provider','system','partner')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected','reversed')),
  record_status text not null default 'recorded' check (record_status in ('recorded','voided','reversed')),
  provider_reference text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_products (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_organizations(id),
  name text not null,
  description text,
  purpose text not null default 'general',
  min_amount numeric(14,2) check (min_amount is null or min_amount > 0),
  max_amount numeric(14,2) check (max_amount is null or max_amount > 0),
  min_term_months integer check (min_term_months is null or min_term_months > 0),
  max_term_months integer check (max_term_months is null or max_term_months > 0),
  published_terms jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  application_ref text not null unique default ('MS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  user_id uuid not null references public.profiles(id) on delete cascade,
  motorcycle_id uuid references public.motorcycles(id) on delete set null,
  product_id uuid references public.loan_products(id) on delete set null,
  purpose text not null,
  requested_amount numeric(14,2) not null check (requested_amount > 0),
  term_months integer not null check (term_months between 1 and 120),
  notes text,
  status text not null default 'submitted' check (status in ('draft','submitted','awaiting_documents','under_review','referred_to_partner','offer_available','accepted_by_applicant','declined_by_applicant','approved_by_lender','rejected_by_lender','awaiting_agreement','awaiting_disbursement','disbursed','active','completed','cancelled','withdrawn','expired')),
  lender_reference text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  partner_id uuid not null references public.partner_organizations(id),
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  interest_rate numeric(8,5) not null check (interest_rate >= 0),
  interest_basis text not null,
  fees numeric(14,2) not null default 0 check (fees >= 0),
  term_months integer not null check (term_months between 1 and 120),
  payment_frequency text not null check (payment_frequency in ('weekly','biweekly','monthly')),
  total_repayment numeric(14,2) not null check (total_repayment >= principal_amount),
  terms jsonb not null default '{}'::jsonb,
  status text not null default 'offered' check (status in ('offered','accepted','declined','expired','withdrawn')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.repayment_installments (
  id uuid primary key default gen_random_uuid(),
  loan_application_id uuid not null references public.loan_applications(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  principal_due numeric(14,2) not null default 0 check (principal_due >= 0),
  interest_due numeric(14,2) not null default 0 check (interest_due >= 0),
  fees_due numeric(14,2) not null default 0 check (fees_due >= 0),
  total_due numeric(14,2) generated always as (principal_due + interest_due + fees_due) stored,
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  status text not null default 'scheduled' check (status in ('scheduled','due','pending','partially_paid','paid','overdue','failed','reversed')),
  partner_reference text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (loan_application_id, installment_number)
);

create table if not exists public.insurance_products (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_organizations(id),
  name text not null,
  coverage_type text not null,
  description text,
  exclusions text,
  premium_basis text not null default 'quote_required',
  supports_monthly_payments boolean not null default false,
  terms jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.insurance_quote_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  motorcycle_id uuid references public.motorcycles(id) on delete set null,
  product_id uuid references public.insurance_products(id) on delete set null,
  notes text,
  status text not null default 'submitted' check (status in ('submitted','under_review','information_requested','quote_available','accepted','declined','expired','cancelled')),
  partner_reference text,
  quoted_premium numeric(14,2) check (quoted_premium is null or quoted_premium > 0),
  coverage_duration_months integer check (coverage_duration_months is null or coverage_duration_months between 1 and 120),
  quoted_terms jsonb not null default '{}'::jsonb,
  quote_expires_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  motorcycle_id uuid references public.motorcycles(id) on delete set null,
  product_id uuid references public.insurance_products(id) on delete set null,
  policy_number text,
  status text not null default 'pending' check (status in ('pending','quoted','awaiting_payment','active','expired','cancelled','suspended','claim_in_progress')),
  coverage_start date,
  coverage_end date,
  provider_reference text,
  terms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, policy_number)
);

-- Idempotency guard: one pending/issued policy can be created per accepted quote request.
create unique index if not exists insurance_policies_quote_request_unique
  on public.insurance_policies ((terms ->> 'quote_request_id'))
  where terms ? 'quote_request_id';

create table if not exists public.insurance_premium_installments (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.insurance_policies(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount_due numeric(14,2) not null check (amount_due > 0),
  status text not null default 'scheduled' check (status in ('scheduled','due','pending','confirmed','failed','overdue','reversed','cancelled','simulated_confirmed')),
  provider_reference text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (policy_id, installment_number)
);

create table if not exists public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_id uuid not null references public.insurance_policies(id) on delete cascade,
  incident_date date not null,
  description text not null check (length(trim(description)) >= 10),
  status text not null default 'submitted' check (status in ('submitted','under_review','information_requested','accepted','rejected','settled','closed')),
  insurer_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_reference text,
  idempotency_key text not null unique,
  purpose text not null check (purpose in ('savings_contribution','loan_repayment','insurance_premium','other')),
  related_entity_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'RWF' check (currency = 'RWF'),
  status text not null default 'created' check (status in ('created','pending','confirmed','failed','reversed','simulated_confirmed')),
  is_simulated boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'general',
  action_path text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  category text not null,
  description text not null check (length(trim(description)) >= 10),
  status text not null default 'open' check (status in ('open','assigned','awaiting_user','awaiting_partner','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.partner_organizations(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_motorcycles_owner_created on public.motorcycles(owner_id, created_at desc);
create index if not exists idx_savings_goals_user_status on public.savings_goals(user_id, status, created_at desc);
create index if not exists idx_savings_transactions_user_created on public.savings_transactions(user_id, created_at desc);
create index if not exists idx_savings_transactions_goal on public.savings_transactions(goal_id);
create index if not exists idx_loan_apps_user_created on public.loan_applications(user_id, created_at desc);
create index if not exists idx_loan_apps_status on public.loan_applications(status, created_at desc);
create index if not exists idx_loan_offers_application on public.loan_offers(application_id, created_at desc);
create index if not exists idx_repayment_due_date_status on public.repayment_installments(due_date, status);
create index if not exists idx_insurance_quotes_user_created on public.insurance_quote_requests(user_id, created_at desc);
create index if not exists idx_insurance_policies_user_coverage on public.insurance_policies(user_id, coverage_end);
create index if not exists idx_insurance_premiums_policy_due on public.insurance_premium_installments(policy_id, due_date);
create index if not exists idx_notifications_user_unread on public.notifications(user_id, is_read, created_at desc);
create index if not exists idx_support_tickets_user_status on public.support_tickets(user_id, status, created_at desc);
create index if not exists idx_audit_logs_entity_created on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_motosave_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, account_status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    'rider',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_motosave_user() from public, anon, authenticated;
drop trigger if exists on_motosave_auth_user_created on auth.users;
create trigger on_motosave_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_motosave_user();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','partner_organizations','partner_memberships','motorcycles','motorcycle_documents','maintenance_records',
    'savings_goals','savings_transactions','loan_products','loan_applications','loan_offers','repayment_installments',
    'insurance_products','insurance_quote_requests','insurance_policies','insurance_premium_installments','insurance_claims',
    'payment_transactions','notifications','support_tickets','support_messages','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
drop trigger if exists motorcycles_set_updated_at on public.motorcycles;
create trigger motorcycles_set_updated_at before update on public.motorcycles for each row execute procedure public.set_updated_at();
drop trigger if exists savings_goals_set_updated_at on public.savings_goals;
create trigger savings_goals_set_updated_at before update on public.savings_goals for each row execute procedure public.set_updated_at();
drop trigger if exists loan_applications_set_updated_at on public.loan_applications;
create trigger loan_applications_set_updated_at before update on public.loan_applications for each row execute procedure public.set_updated_at();
drop trigger if exists insurance_products_set_updated_at on public.insurance_products;
create trigger insurance_products_set_updated_at before update on public.insurance_products for each row execute procedure public.set_updated_at();
drop trigger if exists insurance_quotes_set_updated_at on public.insurance_quote_requests;
create trigger insurance_quotes_set_updated_at before update on public.insurance_quote_requests for each row execute procedure public.set_updated_at();
drop trigger if exists insurance_policies_set_updated_at on public.insurance_policies;
create trigger insurance_policies_set_updated_at before update on public.insurance_policies for each row execute procedure public.set_updated_at();
drop trigger if exists insurance_claims_set_updated_at on public.insurance_claims;
create trigger insurance_claims_set_updated_at before update on public.insurance_claims for each row execute procedure public.set_updated_at();
drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at before update on public.support_tickets for each row execute procedure public.set_updated_at();
drop trigger if exists partner_organizations_set_updated_at on public.partner_organizations;
create trigger partner_organizations_set_updated_at before update on public.partner_organizations for each row execute procedure public.set_updated_at();

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Public catalog access is read-only and restricted to explicitly published records.
grant select on public.partner_organizations, public.loan_products, public.insurance_products to anon, authenticated;
create policy published_organizations_read on public.partner_organizations for select to anon, authenticated using (status = 'verified' and is_published = true);
create policy published_loan_products_read on public.loan_products for select to anon, authenticated using (
  is_published = true and exists (
    select 1 from public.partner_organizations po
    where po.id = partner_id and po.status = 'verified' and po.is_published = true
  )
);
create policy published_insurance_products_read on public.insurance_products for select to anon, authenticated using (
  is_published = true and exists (
    select 1 from public.partner_organizations po
    where po.id = partner_id and po.status = 'verified' and po.is_published = true
  )
);

-- Profiles: role and account_status can never be changed through the client Data API.
grant select on public.profiles to authenticated;
grant update (full_name, phone, preferred_language, avatar_url) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Motorcycle records.
grant select on public.motorcycles to authenticated;
grant insert (owner_id, registration_number, make, model, model_year, vehicle_type, ownership_status, is_electric, notes) on public.motorcycles to authenticated;
grant update (registration_number, make, model, model_year, vehicle_type, ownership_status, is_electric, notes, status) on public.motorcycles to authenticated;
create policy motorcycles_select_own on public.motorcycles for select to authenticated using (owner_id = (select auth.uid()));
create policy motorcycles_insert_own on public.motorcycles for insert to authenticated with check (owner_id = (select auth.uid()));
create policy motorcycles_update_own on public.motorcycles for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

grant select on public.motorcycle_documents to authenticated;
grant insert (owner_id, motorcycle_id, document_type, storage_path, expires_on) on public.motorcycle_documents to authenticated;
create policy motorcycle_documents_select_own on public.motorcycle_documents for select to authenticated using (owner_id = (select auth.uid()));
create policy motorcycle_documents_insert_own on public.motorcycle_documents for insert to authenticated with check (
  owner_id = (select auth.uid())
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and exists (select 1 from public.motorcycles m where m.id = motorcycle_id and m.owner_id = (select auth.uid()))
);

grant select on public.maintenance_records to authenticated;
grant insert (owner_id, motorcycle_id, service_date, description, amount, odometer_km, next_service_date) on public.maintenance_records to authenticated;
create policy maintenance_records_select_own on public.maintenance_records for select to authenticated using (owner_id = (select auth.uid()));
create policy maintenance_records_insert_own on public.maintenance_records for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.motorcycles m where m.id = motorcycle_id and m.owner_id = (select auth.uid())));

-- Savings goals are planning records, never custodial balances.
grant select on public.savings_goals to authenticated;
grant insert (user_id, title, purpose, target_amount, target_date, contribution_frequency, priority) on public.savings_goals to authenticated;
grant update (title, purpose, target_amount, target_date, contribution_frequency, priority, status) on public.savings_goals to authenticated;
create policy savings_goals_select_own on public.savings_goals for select to authenticated using (user_id = (select auth.uid()));
create policy savings_goals_insert_own on public.savings_goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy savings_goals_update_own on public.savings_goals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Client users can append manual, unverified entries only. Transactions cannot be edited or deleted from clients.
grant select on public.savings_transactions to authenticated;
grant insert (user_id, goal_id, amount, note) on public.savings_transactions to authenticated;
create policy savings_transactions_select_own on public.savings_transactions for select to authenticated using (user_id = (select auth.uid()));
create policy savings_transactions_insert_manual_own on public.savings_transactions for insert to authenticated with check (
  user_id = (select auth.uid()) and source = 'manual' and verification_status = 'unverified'
  and record_status = 'recorded'
  and (goal_id is null or exists (select 1 from public.savings_goals g where g.id = goal_id and g.user_id = (select auth.uid())))
);

-- User-submitted applications are read-only after submission; partners update state via trusted server-side operations.
grant select on public.loan_applications to authenticated;
grant insert (user_id, motorcycle_id, product_id, purpose, requested_amount, term_months, notes) on public.loan_applications to authenticated;
create policy loan_applications_select_own on public.loan_applications for select to authenticated using (user_id = (select auth.uid()));
create policy loan_applications_insert_own on public.loan_applications for insert to authenticated with check (
  user_id = (select auth.uid())
  and (motorcycle_id is null or exists (select 1 from public.motorcycles m where m.id = motorcycle_id and m.owner_id = (select auth.uid())))
  and (product_id is null or exists (
    select 1 from public.loan_products lp
    join public.partner_organizations po on po.id = lp.partner_id
    where lp.id = product_id and lp.is_published = true and po.status = 'verified' and po.is_published = true
  ))
);

grant select on public.loan_offers to authenticated;
create policy loan_offers_select_own on public.loan_offers for select to authenticated using (exists (select 1 from public.loan_applications a where a.id = application_id and a.user_id = (select auth.uid())));
grant select on public.repayment_installments to authenticated;
create policy repayment_installments_select_own on public.repayment_installments for select to authenticated using (exists (select 1 from public.loan_applications a where a.id = loan_application_id and a.user_id = (select auth.uid())));

-- Insurance quote requests can be made by a rider; policies and premium schedules are partner-controlled.
grant select on public.insurance_quote_requests to authenticated;
grant insert (user_id, motorcycle_id, product_id, notes) on public.insurance_quote_requests to authenticated;
create policy insurance_quotes_select_own on public.insurance_quote_requests for select to authenticated using (user_id = (select auth.uid()));
create policy insurance_quotes_insert_own on public.insurance_quote_requests for insert to authenticated with check (
  user_id = (select auth.uid())
  and (motorcycle_id is null or exists (select 1 from public.motorcycles m where m.id = motorcycle_id and m.owner_id = (select auth.uid())))
  and (product_id is null or exists (
    select 1 from public.insurance_products ip
    join public.partner_organizations po on po.id = ip.partner_id
    where ip.id = product_id and ip.is_published = true and po.status = 'verified' and po.is_published = true
  ))
);
grant select on public.insurance_policies to authenticated;
create policy insurance_policies_select_own on public.insurance_policies for select to authenticated using (user_id = (select auth.uid()));
grant select on public.insurance_premium_installments to authenticated;
create policy insurance_premiums_select_own on public.insurance_premium_installments for select to authenticated using (exists (select 1 from public.insurance_policies p where p.id = policy_id and p.user_id = (select auth.uid())));
grant select on public.insurance_claims to authenticated;
grant insert (user_id, policy_id, incident_date, description) on public.insurance_claims to authenticated;
create policy insurance_claims_select_own on public.insurance_claims for select to authenticated using (user_id = (select auth.uid()));
create policy insurance_claims_insert_own on public.insurance_claims for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.insurance_policies p where p.id = policy_id and p.user_id = (select auth.uid())));

grant select on public.payment_transactions to authenticated;
create policy payment_transactions_select_own on public.payment_transactions for select to authenticated using (user_id = (select auth.uid()));

grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.support_tickets to authenticated;
grant insert (user_id, subject, category, description) on public.support_tickets to authenticated;
create policy support_tickets_select_own on public.support_tickets for select to authenticated using (user_id = (select auth.uid()));
create policy support_tickets_insert_own on public.support_tickets for insert to authenticated with check (user_id = (select auth.uid()));

grant select on public.support_messages to authenticated;
grant insert (ticket_id, body) on public.support_messages to authenticated;
create policy support_messages_select_own on public.support_messages for select to authenticated using (
  exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
);
create policy support_messages_insert_own on public.support_messages for insert to authenticated with check (
  author_id = (select auth.uid()) and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()))
);

-- Privileged operational data is server-managed. No direct browser/mobile table grants.


-- Private rider-document storage. Paths must begin with the authenticated user's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rider-documents', 'rider-documents', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rider_documents_select_own on storage.objects;
create policy rider_documents_select_own on storage.objects for select to authenticated
using (bucket_id = 'rider-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists rider_documents_insert_own on storage.objects;
create policy rider_documents_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'rider-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists rider_documents_update_own on storage.objects;
create policy rider_documents_update_own on storage.objects for update to authenticated
using (bucket_id = 'rider-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'rider-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists rider_documents_delete_own on storage.objects;
create policy rider_documents_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'rider-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
