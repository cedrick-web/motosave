import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

type Json = Record<string, unknown>;
type PartnerType = "lender" | "insurer" | "support_agent";
type PartnerRole = "lender_officer" | "insurer_officer" | "support_agent";

const loanStatuses = new Set([
  "submitted", "awaiting_documents", "under_review", "referred_to_partner", "offer_available",
  "approved_by_lender", "rejected_by_lender", "awaiting_agreement", "awaiting_disbursement",
  "disbursed", "active", "completed", "cancelled", "withdrawn", "expired",
]);
const claimStatuses = new Set([
  "submitted", "under_review", "information_requested", "accepted", "rejected", "settled", "closed",
]);
const policyStatuses = new Set([
  "pending", "quoted", "awaiting_payment", "active", "expired", "cancelled", "suspended", "claim_in_progress",
]);
const ticketStatuses = new Set(["open", "assigned", "awaiting_user", "awaiting_partner", "resolved", "closed"]);

function makeHeaders(allowedOrigin: string | undefined) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin || "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function respond(status: number, body: Json, allowedOrigin?: string) {
  return new Response(JSON.stringify(body), { status, headers: makeHeaders(allowedOrigin) });
}
function fail(message: string, status = 400, allowedOrigin?: string) {
  return respond(status, { error: message }, allowedOrigin);
}
function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
function textValue(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}
function positiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function validReason(value: unknown): string | null {
  const reason = textValue(value, 500);
  return reason && reason.length >= 5 ? reason : null;
}
function actorCanUseRole(role: string, allowed: PartnerRole[]) {
  return role === "platform_admin" || allowed.includes(role as PartnerRole);
}

async function activePartnerMemberships(admin: SupabaseClient, userId: string, role: PartnerRole) {
  const { data, error } = await admin.from("partner_memberships")
    .select("organization_id,partner_role")
    .eq("user_id", userId)
    .eq("partner_role", role)
    .eq("status", "active");
  if (error) throw new Error("membership_lookup_failed");
  return (data || []).map((row: { organization_id: string; partner_role: PartnerRole }) => row.organization_id);
}

async function authorizePartner(
  admin: SupabaseClient,
  userId: string,
  role: string,
  organizationId: string,
  expectedType: PartnerType,
  expectedRole: PartnerRole,
) {
  if (role === "platform_admin") return true;
  if (role !== expectedRole) return false;
  const organizationIds = await activePartnerMemberships(admin, userId, expectedRole);
  if (!organizationIds.includes(organizationId)) return false;
  const { data, error } = await admin.from("partner_organizations")
    .select("id,partner_type,status")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return false;
  return data.partner_type === expectedType && data.status === "verified";
}

async function audit(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  reason: string,
  organizationId: string | null,
  requestId: string | null,
) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: actorId,
    organization_id: organizationId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    reason,
    request_id: requestId,
    metadata: { source: "partner-operations-edge-function" },
  });
  if (error) throw new Error("audit_record_failed");
}

async function loadQueue(admin: SupabaseClient, userId: string, role: string): Promise<Json> {
  if (role === "platform_admin") {
    const [loanApps, claims, tickets, policies] = await Promise.all([
      admin.from("loan_applications").select("id,application_ref,user_id,product_id,purpose,requested_amount,term_months,status,submitted_at").order("created_at", { ascending: false }).limit(100),
      admin.from("insurance_claims").select("id,user_id,policy_id,incident_date,description,status,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("support_tickets").select("id,user_id,subject,category,description,status,priority,assigned_to,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("insurance_policies").select("id,user_id,product_id,policy_number,status,coverage_start,coverage_end,provider_reference").order("created_at", { ascending: false }).limit(100),
    ]);
    if ([loanApps, claims, tickets, policies].some((result) => result.error)) throw new Error("queue_load_failed");
    return { role, loan_applications: loanApps.data || [], insurance_claims: claims.data || [], support_tickets: tickets.data || [], insurance_policies: policies.data || [] };
  }

  if (role === "lender_officer") {
    const organizations = await activePartnerMemberships(admin, userId, "lender_officer");
    if (!organizations.length) return { role, loan_applications: [], loan_offers: [] };
    const { data: products, error: productError } = await admin.from("loan_products").select("id,partner_id,name").in("partner_id", organizations);
    if (productError) throw new Error("loan_product_lookup_failed");
    const productIds = (products || []).map((product: { id: string }) => product.id);
    if (!productIds.length) return { role, loan_applications: [], loan_offers: [] };
    const { data: apps, error } = await admin.from("loan_applications")
      .select("id,application_ref,user_id,product_id,purpose,requested_amount,term_months,notes,status,submitted_at,created_at")
      .in("product_id", productIds)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error("loan_queue_load_failed");
    const appIds = (apps || []).map((app: { id: string }) => app.id);
    const offersResult = appIds.length
      ? await admin.from("loan_offers").select("id,application_id,principal_amount,total_repayment,term_months,status,expires_at").in("application_id", appIds)
      : { data: [], error: null };
    if (offersResult.error) throw new Error("loan_offer_queue_load_failed");
    return { role, loan_products: products || [], loan_applications: apps || [], loan_offers: offersResult.data || [] };
  }

  if (role === "insurer_officer") {
    const organizations = await activePartnerMemberships(admin, userId, "insurer_officer");
    if (!organizations.length) return { role, insurance_claims: [], insurance_policies: [] };
    const { data: products, error: productError } = await admin.from("insurance_products").select("id,partner_id,name").in("partner_id", organizations);
    if (productError) throw new Error("insurance_product_lookup_failed");
    const productIds = (products || []).map((product: { id: string }) => product.id);
    if (!productIds.length) return { role, insurance_claims: [], insurance_policies: [] };
    const { data: policies, error: policyError } = await admin.from("insurance_policies")
      .select("id,user_id,product_id,policy_number,status,coverage_start,coverage_end,provider_reference")
      .in("product_id", productIds).order("created_at", { ascending: false }).limit(100);
    if (policyError) throw new Error("insurance_policy_queue_load_failed");
    const policyIds = (policies || []).map((policy: { id: string }) => policy.id);
    const claimResult = policyIds.length
      ? await admin.from("insurance_claims").select("id,user_id,policy_id,incident_date,description,status,created_at").in("policy_id", policyIds).order("created_at", { ascending: false }).limit(100)
      : { data: [], error: null };
    if (claimResult.error) throw new Error("insurance_claim_queue_load_failed");
    return { role, insurance_products: products || [], insurance_policies: policies || [], insurance_claims: claimResult.data || [] };
  }

  if (role === "support_agent") {
    const { data, error } = await admin.from("support_tickets")
      .select("id,user_id,subject,category,description,status,priority,assigned_to,created_at")
      .in("status", ["open", "assigned", "awaiting_user", "awaiting_partner"])
      .order("created_at", { ascending: true }).limit(100);
    if (error) throw new Error("support_queue_load_failed");
    return { role, support_tickets: data || [] };
  }

  return { role, unsupported: true };
}

Deno.serve(async (request: Request) => {
  const allowedOrigin = Deno.env.get("MOTOSAVE_ALLOWED_ORIGIN");
  const requestOrigin = request.headers.get("Origin");

  if (requestOrigin && (!allowedOrigin || requestOrigin !== allowedOrigin)) {
    return fail("origin_not_allowed", 403, allowedOrigin);
  }
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: makeHeaders(allowedOrigin) });
  if (request.method !== "POST") return fail("method_not_allowed", 405, allowedOrigin);

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorization || !supabaseUrl || !publishableKey || !serviceRoleKey) {
    return fail("server_configuration_or_session_missing", 401, allowedOrigin);
  }

  let body: Json;
  try {
    body = await request.json() as Json;
  } catch {
    return fail("invalid_json", 400, allowedOrigin);
  }
  const action = textValue(body.action, 80);
  if (!action) return fail("action_required", 400, allowedOrigin);

  const client = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return fail("invalid_session", 401, allowedOrigin);
  const userId = authData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("role,account_status")
    .eq("id", userId).maybeSingle();
  if (profileError || !profile) return fail("profile_not_found", 403, allowedOrigin);
  if (profile.account_status !== "active") return fail("account_not_active", 403, allowedOrigin);
  const role = String(profile.role || "rider");
  const reason = validReason(body.reason) || "Operational action requested through MotoSave.";
  const requestId = request.headers.get("x-request-id");

  try {
    if (action === "list_queue") {
      if (!actorCanUseRole(role, ["lender_officer", "insurer_officer", "support_agent"])) {
        return fail("operations_access_denied", 403, allowedOrigin);
      }
      return respond(200, { ok: true, queue: await loadQueue(admin, userId, role) }, allowedOrigin);
    }

    if (action === "update_loan_status") {
      if (!actorCanUseRole(role, ["lender_officer"])) return fail("lender_access_required", 403, allowedOrigin);
      const applicationId = textValue(body.application_id, 80);
      const nextStatus = textValue(body.status, 80);
      if (!applicationId || !nextStatus || !loanStatuses.has(nextStatus)) return fail("invalid_application_or_status", 400, allowedOrigin);
      const { data: application, error } = await admin.from("loan_applications")
        .select("id,product_id,status").eq("id", applicationId).maybeSingle();
      if (error || !application) return fail("application_not_found", 404, allowedOrigin);
      if (!application.product_id) return fail("application_not_routed_to_lender", 409, allowedOrigin);
      const { data: product, error: productError } = await admin.from("loan_products")
        .select("partner_id").eq("id", application.product_id).maybeSingle();
      if (productError || !product) return fail("loan_product_not_found", 404, allowedOrigin);
      if (!await authorizePartner(admin, userId, role, product.partner_id, "lender", "lender_officer")) {
        return fail("partner_scope_denied", 403, allowedOrigin);
      }
      if (["completed", "rejected_by_lender", "cancelled", "withdrawn", "expired"].includes(application.status)) {
        return fail("application_is_terminal", 409, allowedOrigin);
      }
      if (nextStatus === "rejected_by_lender" && !validReason(body.reason)) return fail("rejection_reason_required", 400, allowedOrigin);
      const { error: updateError } = await admin.from("loan_applications").update({
        status: nextStatus,
        decided_at: ["approved_by_lender", "rejected_by_lender"].includes(nextStatus) ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", applicationId);
      if (updateError) return fail("application_update_failed", 500, allowedOrigin);
      await audit(admin, userId, "update_loan_status", "loan_application", applicationId, reason, product.partner_id, requestId);
      return respond(200, { ok: true, application_id: applicationId, status: nextStatus }, allowedOrigin);
    }

    if (action === "create_loan_offer") {
      if (!actorCanUseRole(role, ["lender_officer"])) return fail("lender_access_required", 403, allowedOrigin);
      const applicationId = textValue(body.application_id, 80);
      const principalAmount = positiveNumber(body.principal_amount);
      const requestedRate = Number(body.interest_rate);
      const fees = Number(body.fees ?? 0);
      const totalRepayment = positiveNumber(body.total_repayment);
      const termMonths = Number(body.term_months);
      const interestBasis = textValue(body.interest_basis, 80);
      const paymentFrequency = textValue(body.payment_frequency, 20);
      const expiresAt = typeof body.expires_at === "string" ? body.expires_at : null;
      if (!applicationId || !principalAmount || !totalRepayment || !Number.isFinite(requestedRate) || requestedRate < 0 ||
          !Number.isFinite(fees) || fees < 0 || !Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120 ||
          !interestBasis || !["weekly", "biweekly", "monthly"].includes(paymentFrequency || "")) {
        return fail("invalid_offer_terms", 400, allowedOrigin);
      }
      if (totalRepayment < principalAmount || totalRepayment < principalAmount + fees) return fail("total_repayment_inconsistent", 400, allowedOrigin);
      if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return fail("invalid_expiry", 400, allowedOrigin);
      const { data: application, error } = await admin.from("loan_applications")
        .select("id,product_id,status,requested_amount").eq("id", applicationId).maybeSingle();
      if (error || !application) return fail("application_not_found", 404, allowedOrigin);
      if (!application.product_id) return fail("application_not_routed_to_lender", 409, allowedOrigin);
      if (principalAmount > Number(application.requested_amount)) return fail("offer_exceeds_requested_amount", 400, allowedOrigin);
      if (!["submitted", "awaiting_documents", "under_review", "referred_to_partner"].includes(application.status)) {
        return fail("application_not_ready_for_offer", 409, allowedOrigin);
      }
      const { data: product } = await admin.from("loan_products").select("partner_id").eq("id", application.product_id).maybeSingle();
      if (!product || !await authorizePartner(admin, userId, role, product.partner_id, "lender", "lender_officer")) {
        return fail("partner_scope_denied", 403, allowedOrigin);
      }
      const { data: offer, error: offerError } = await admin.from("loan_offers").insert({
        application_id: applicationId, partner_id: product.partner_id, principal_amount: principalAmount,
        interest_rate: requestedRate, interest_basis: interestBasis, fees, term_months: termMonths,
        payment_frequency: paymentFrequency, total_repayment: totalRepayment,
        terms: { reason }, expires_at: expiresAt,
      }).select("id,application_id,principal_amount,total_repayment,term_months,status,expires_at").single();
      if (offerError || !offer) return fail("offer_create_failed", 500, allowedOrigin);
      const { error: updateError } = await admin.from("loan_applications")
        .update({ status: "offer_available", updated_at: new Date().toISOString() }).eq("id", applicationId);
      if (updateError) return respond(500, { error: "offer_created_application_update_failed", offer_id: offer.id }, allowedOrigin);
      await audit(admin, userId, "create_loan_offer", "loan_offer", offer.id, reason, product.partner_id, requestId);
      return respond(201, { ok: true, offer }, allowedOrigin);
    }

    if (action === "update_claim_status") {
      if (!actorCanUseRole(role, ["insurer_officer"])) return fail("insurer_access_required", 403, allowedOrigin);
      const claimId = textValue(body.claim_id, 80);
      const nextStatus = textValue(body.status, 80);
      if (!claimId || !nextStatus || !claimStatuses.has(nextStatus)) return fail("invalid_claim_or_status", 400, allowedOrigin);
      if (["rejected", "settled"].includes(nextStatus) && !validReason(body.reason)) return fail("decision_reason_required", 400, allowedOrigin);
      const { data: claim } = await admin.from("insurance_claims").select("id,policy_id,status").eq("id", claimId).maybeSingle();
      if (!claim) return fail("claim_not_found", 404, allowedOrigin);
      const { data: policy } = await admin.from("insurance_policies").select("id,product_id").eq("id", claim.policy_id).maybeSingle();
      if (!policy?.product_id) return fail("policy_not_routed_to_insurer", 409, allowedOrigin);
      const { data: product } = await admin.from("insurance_products").select("partner_id").eq("id", policy.product_id).maybeSingle();
      if (!product || !await authorizePartner(admin, userId, role, product.partner_id, "insurer", "insurer_officer")) return fail("partner_scope_denied", 403, allowedOrigin);
      if (["settled", "closed", "rejected"].includes(claim.status)) return fail("claim_is_terminal", 409, allowedOrigin);
      const { error } = await admin.from("insurance_claims").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", claimId);
      if (error) return fail("claim_update_failed", 500, allowedOrigin);
      await audit(admin, userId, "update_claim_status", "insurance_claim", claimId, reason, product.partner_id, requestId);
      return respond(200, { ok: true, claim_id: claimId, status: nextStatus }, allowedOrigin);
    }

    if (action === "update_policy_status") {
      if (!actorCanUseRole(role, ["insurer_officer"])) return fail("insurer_access_required", 403, allowedOrigin);
      const policyId = textValue(body.policy_id, 80);
      const nextStatus = textValue(body.status, 80);
      if (!policyId || !nextStatus || !policyStatuses.has(nextStatus)) return fail("invalid_policy_or_status", 400, allowedOrigin);
      const { data: policy } = await admin.from("insurance_policies").select("id,product_id,status").eq("id", policyId).maybeSingle();
      if (!policy?.product_id) return fail("policy_not_found_or_not_routed", 404, allowedOrigin);
      const { data: product } = await admin.from("insurance_products").select("partner_id").eq("id", policy.product_id).maybeSingle();
      if (!product || !await authorizePartner(admin, userId, role, product.partner_id, "insurer", "insurer_officer")) return fail("partner_scope_denied", 403, allowedOrigin);
      const update: Json = { status: nextStatus, updated_at: new Date().toISOString() };
      if (nextStatus === "active") {
        const policyNumber = textValue(body.policy_number, 120);
        const providerReference = textValue(body.provider_reference, 160);
        if (!policyNumber || !providerReference || !isDate(body.coverage_start) || !isDate(body.coverage_end) || String(body.coverage_end) < String(body.coverage_start)) {
          return fail("active_policy_requires_number_reference_and_valid_coverage_dates", 400, allowedOrigin);
        }
        update.policy_number = policyNumber;
        update.provider_reference = providerReference;
        update.coverage_start = body.coverage_start;
        update.coverage_end = body.coverage_end;
      }
      const { error } = await admin.from("insurance_policies").update(update).eq("id", policyId);
      if (error) return fail("policy_update_failed", 500, allowedOrigin);
      await audit(admin, userId, "update_policy_status", "insurance_policy", policyId, reason, product.partner_id, requestId);
      return respond(200, { ok: true, policy_id: policyId, status: nextStatus }, allowedOrigin);
    }

    if (action === "assign_support_ticket") {
      if (!actorCanUseRole(role, ["support_agent"])) return fail("support_access_required", 403, allowedOrigin);
      const ticketId = textValue(body.ticket_id, 80);
      const nextStatus = textValue(body.status || "assigned", 80);
      if (!ticketId || !nextStatus || !ticketStatuses.has(nextStatus)) return fail("invalid_ticket_or_status", 400, allowedOrigin);
      const { data: ticket } = await admin.from("support_tickets").select("id,status").eq("id", ticketId).maybeSingle();
      if (!ticket) return fail("ticket_not_found", 404, allowedOrigin);
      const { error } = await admin.from("support_tickets").update({
        assigned_to: userId, status: nextStatus, updated_at: new Date().toISOString(),
      }).eq("id", ticketId);
      if (error) return fail("ticket_update_failed", 500, allowedOrigin);
      await audit(admin, userId, "assign_support_ticket", "support_ticket", ticketId, reason, null, requestId);
      return respond(200, { ok: true, ticket_id: ticketId, status: nextStatus, assigned_to: userId }, allowedOrigin);
    }

    return fail("unknown_action", 400, allowedOrigin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    return fail(message, message.includes("lookup_failed") || message.includes("queue_load_failed") ? 500 : 400, allowedOrigin);
  }
});
