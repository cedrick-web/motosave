import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

type Json = Record<string, unknown>;
type PartnerType = "cooperative" | "lender" | "insurer" | "payment_provider" | "service_provider";
type PartnerRole = "cooperative_officer" | "lender_officer" | "insurer_officer" | "support_agent" | "auditor";

const partnerRoleOrganizationType: Record<string, PartnerType> = {
  cooperative_officer: "cooperative",
  lender_officer: "lender",
  insurer_officer: "insurer",
};

const loanStatuses = new Set([
  "submitted", "awaiting_documents", "under_review", "referred_to_partner", "offer_available",
  "approved_by_lender", "rejected_by_lender", "awaiting_agreement", "awaiting_disbursement",
  "disbursed", "active", "completed", "cancelled", "withdrawn", "expired",
]);
const loanStatusTransitions: Record<string, string[]> = {
  submitted: ["under_review", "awaiting_documents", "referred_to_partner", "rejected_by_lender", "cancelled"],
  awaiting_documents: ["under_review", "referred_to_partner", "rejected_by_lender", "cancelled"],
  under_review: ["awaiting_documents", "referred_to_partner", "rejected_by_lender"],
  referred_to_partner: ["under_review", "awaiting_documents", "rejected_by_lender"],
  accepted_by_applicant: ["awaiting_agreement", "cancelled"],
  awaiting_agreement: ["awaiting_disbursement", "cancelled", "expired"],
  awaiting_disbursement: ["disbursed", "cancelled"],
  disbursed: ["active", "completed"],
  active: ["completed"],
};
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
    const [loanApps, claims, tickets, policies, quoteRequests, organizations, memberships, profiles, loanProducts, insuranceProducts, motorcycleDocuments] = await Promise.all([
      admin.from("loan_applications").select("id,application_ref,user_id,product_id,purpose,requested_amount,term_months,status,submitted_at").order("created_at", { ascending: false }).limit(100),
      admin.from("insurance_claims").select("id,user_id,policy_id,incident_date,description,status,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("support_tickets").select("id,user_id,subject,category,description,status,priority,assigned_to,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("insurance_policies").select("id,user_id,product_id,policy_number,status,coverage_start,coverage_end,provider_reference").order("created_at", { ascending: false }).limit(100),
      admin.from("insurance_quote_requests").select("id,user_id,product_id,motorcycle_id,notes,status,quoted_premium,coverage_duration_months,quoted_terms,quote_expires_at,decision_reason,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("partner_organizations").select("id,legal_name,display_name,partner_type,public_contact,status,is_published,created_at").order("created_at", { ascending: false }).limit(200),
      admin.from("partner_memberships").select("id,user_id,organization_id,partner_role,status,created_at").order("created_at", { ascending: false }).limit(300),
      admin.from("profiles").select("id,full_name,phone,role,account_status,created_at").order("created_at", { ascending: false }).limit(200),
      admin.from("loan_products").select("id,partner_id,name,description,purpose,min_amount,max_amount,min_term_months,max_term_months,is_published").order("created_at", { ascending: false }).limit(200),
      admin.from("insurance_products").select("id,partner_id,name,description,coverage_type,supports_monthly_payments,is_published").order("created_at", { ascending: false }).limit(200),
      admin.from("motorcycle_documents").select("id,owner_id,motorcycle_id,document_type,storage_path,expires_on,verification_status,created_at").order("created_at", { ascending: false }).limit(200),
    ]);
    if ([loanApps, claims, tickets, policies, quoteRequests, organizations, memberships, profiles, loanProducts, insuranceProducts, motorcycleDocuments].some((result) => result.error)) throw new Error("queue_load_failed");
    return {
      role,
      loan_applications: loanApps.data || [],
      insurance_claims: claims.data || [],
      support_tickets: tickets.data || [],
      insurance_policies: policies.data || [],
      insurance_quote_requests: quoteRequests.data || [],
      partner_organizations: organizations.data || [],
      partner_memberships: memberships.data || [],
      profiles: profiles.data || [],
      loan_products: loanProducts.data || [],
      insurance_products: insuranceProducts.data || [],
      motorcycle_documents: motorcycleDocuments.data || [],
    };
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
    if (!organizations.length) return { role, insurance_claims: [], insurance_policies: [], insurance_quote_requests: [] };
    const { data: products, error: productError } = await admin.from("insurance_products").select("id,partner_id,name").in("partner_id", organizations);
    if (productError) throw new Error("insurance_product_lookup_failed");
    const productIds = (products || []).map((product: { id: string }) => product.id);
    if (!productIds.length) return { role, insurance_claims: [], insurance_policies: [], insurance_quote_requests: [] };
    const { data: policies, error: policyError } = await admin.from("insurance_policies")
      .select("id,user_id,product_id,policy_number,status,coverage_start,coverage_end,provider_reference")
      .in("product_id", productIds).order("created_at", { ascending: false }).limit(100);
    if (policyError) throw new Error("insurance_policy_queue_load_failed");
    const policyIds = (policies || []).map((policy: { id: string }) => policy.id);
    const claimResult = policyIds.length
      ? await admin.from("insurance_claims").select("id,user_id,policy_id,incident_date,description,status,created_at").in("policy_id", policyIds).order("created_at", { ascending: false }).limit(100)
      : { data: [], error: null };
    if (claimResult.error) throw new Error("insurance_claim_queue_load_failed");
    const { data: quoteRequests, error: quoteError } = await admin.from("insurance_quote_requests")
      .select("id,user_id,product_id,motorcycle_id,notes,status,quoted_premium,coverage_duration_months,quoted_terms,quote_expires_at,decision_reason,created_at")
      .in("product_id", productIds).order("created_at", { ascending: false }).limit(100);
    if (quoteError) throw new Error("insurance_quote_queue_load_failed");
    return { role, insurance_products: products || [], insurance_policies: policies || [], insurance_claims: claimResult.data || [], insurance_quote_requests: quoteRequests || [] };
  }

  if (role === "support_agent") {
    const { data, error } = await admin.from("support_tickets")
      .select("id,user_id,subject,category,description,status,priority,assigned_to,created_at")
      .in("status", ["open", "assigned", "awaiting_user", "awaiting_partner"])
      .or("assigned_to.is.null,assigned_to.eq." + userId)
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
    if (action === "review_motorcycle_document") {
      if (role !== "platform_admin") return fail("platform_admin_required", 403, allowedOrigin);
      const documentId = textValue(body.document_id, 80);
      const nextStatus = textValue(body.status, 40);
      const allowedStatuses = new Set(["unverified", "pending_review", "verified", "rejected", "expired"]);
      if (!documentId || !nextStatus || !allowedStatuses.has(nextStatus) || !validReason(body.reason)) {
        return fail("document_status_and_audit_reason_required", 400, allowedOrigin);
      }
      const { data: document } = await admin.from("motorcycle_documents")
        .select("id,owner_id,motorcycle_id,document_type,storage_path,expires_on,verification_status")
        .eq("id", documentId).maybeSingle();
      if (!document) return fail("motorcycle_document_not_found", 404, allowedOrigin);
      const today = new Date().toISOString().slice(0, 10);
      if (nextStatus === "verified" && document.expires_on && document.expires_on < today) {
        return fail("expired_document_cannot_be_verified", 409, allowedOrigin);
      }
      if (nextStatus === "expired" && (!document.expires_on || document.expires_on >= today)) {
        return fail("document_expiry_date_is_not_in_the_past", 409, allowedOrigin);
      }
      const { error } = await admin.from("motorcycle_documents").update({ verification_status: nextStatus }).eq("id", documentId);
      if (error) return fail("motorcycle_document_review_failed", 500, allowedOrigin);
      const notificationTitle = nextStatus === "verified" ? "Motorcycle document verified"
        : nextStatus === "rejected" ? "Motorcycle document needs attention"
        : nextStatus === "expired" ? "Motorcycle document expired" : "Motorcycle document status updated";
      const notificationMessage = nextStatus === "verified"
        ? "Your " + document.document_type.replaceAll("_", " ") + " document was verified."
        : nextStatus === "rejected"
        ? "Your " + document.document_type.replaceAll("_", " ") + " document was rejected. Review the document and contact support if needed."
        : nextStatus === "expired"
        ? "Your " + document.document_type.replaceAll("_", " ") + " document is marked expired."
        : "Your " + document.document_type.replaceAll("_", " ") + " document status is now " + nextStatus.replaceAll("_", " ") + ".";
      const { error: notificationError } = await admin.from("notifications").insert({
        user_id: document.owner_id,
        title: notificationTitle,
        message: notificationMessage,
        notification_type: "document_review",
        action_path: "/(tabs)/motorcycles",
      });
      await audit(admin, userId, "review_motorcycle_document", "motorcycle_document", documentId, String(body.reason), null, requestId);
      if (notificationError) return respond(200, { ok: true, document_id: documentId, status: nextStatus, notification_created: false }, allowedOrigin);
      return respond(200, { ok: true, document_id: documentId, status: nextStatus, notification_created: true }, allowedOrigin);
    }

    if (action === "create_private_document_url") {
      if (role !== "platform_admin") return fail("platform_admin_required", 403, allowedOrigin);
      const documentId = textValue(body.document_id, 80);
      const accessReason = validReason(body.reason);
      if (!documentId || !accessReason) return fail("document_id_and_access_reason_required", 400, allowedOrigin);
      const { data: document } = await admin.from("motorcycle_documents")
        .select("id,owner_id,motorcycle_id,document_type,storage_path")
        .eq("id", documentId).maybeSingle();
      if (!document) return fail("motorcycle_document_not_found", 404, allowedOrigin);
      const { data: signed, error } = await admin.storage.from("rider-documents").createSignedUrl(document.storage_path, 60);
      if (error || !signed?.signedUrl) return fail("private_document_link_failed", 500, allowedOrigin);
      await audit(admin, userId, "view_private_motorcycle_document", "motorcycle_document", documentId, accessReason, null, requestId);
      return respond(200, { ok: true, signed_url: signed.signedUrl, expires_in_seconds: 60 }, allowedOrigin);
    }

    if (action === "create_partner_organization") {
      if (role !== "platform_admin") return fail("platform_admin_required", 403, allowedOrigin);
      const legalName = textValue(body.legal_name, 200);
      const displayName = textValue(body.display_name, 120);
      const partnerType = textValue(body.partner_type, 40);
      const contact = textValue(body.public_contact, 240);
      const validTypes = new Set(["cooperative", "lender", "insurer", "payment_provider", "service_provider"]);
      if (!legalName || !displayName || !partnerType || !validTypes.has(partnerType) || !validReason(body.reason)) return fail("legal_name_display_name_partner_type_and_reason_required", 400, allowedOrigin);
      const { data: organization, error } = await admin.from("partner_organizations").insert({
        legal_name: legalName,
        display_name: displayName,
        partner_type: partnerType,
        public_contact: contact,
        status: "pending_verification",
        is_published: false,
      }).select("id,legal_name,display_name,partner_type,public_contact,status,is_published,created_at").single();
      if (error || !organization) return fail("partner_organization_create_failed", 500, allowedOrigin);
      await audit(admin, userId, "create_partner_organization", "partner_organization", organization.id, reason, organization.id, requestId);
      return respond(201, { ok: true, organization }, allowedOrigin);
    }

    if (action === "review_partner_organization") {
      if (role !== "platform_admin") return fail("platform_admin_required", 403, allowedOrigin);
      const organizationId = textValue(body.organization_id, 80);
      const nextStatus = textValue(body.status, 40);
      const shouldPublish = body.is_published === true;
      const validStatuses = new Set(["pending_verification", "verified", "suspended", "rejected"]);
      if (!organizationId || !nextStatus || !validStatuses.has(nextStatus)) return fail("organization_id_and_valid_status_required", 400, allowedOrigin);
      if (!validReason(body.reason)) return fail("verification_reason_required", 400, allowedOrigin);
      const { data: organization } = await admin.from("partner_organizations").select("id,partner_type,status").eq("id", organizationId).maybeSingle();
      if (!organization) return fail("partner_organization_not_found", 404, allowedOrigin);
      const publish = nextStatus === "verified" && shouldPublish;
      const { error: updateError } = await admin.from("partner_organizations").update({
        status: nextStatus,
        is_published: publish,
        updated_at: new Date().toISOString(),
      }).eq("id", organizationId);
      if (updateError) return fail("partner_review_failed", 500, allowedOrigin);

      const { data: orgMemberships, error: membershipError } = await admin.from("partner_memberships")
        .select("id,user_id,partner_role,status").eq("organization_id", organizationId);
      if (membershipError) return fail("partner_membership_review_failed", 500, allowedOrigin);
      for (const membership of orgMemberships || []) {
        const memberRole = String(membership.partner_role);
        const mappedType = partnerRoleOrganizationType[memberRole];
        if (nextStatus === "verified" && mappedType === organization.partner_type) {
          const { data: memberProfile } = await admin.from("profiles").select("role,account_status").eq("id", membership.user_id).maybeSingle();
          if (memberProfile?.role === "platform_admin") {
            continue; // Never demote a platform administrator through partner-review side effects.
          }
          if (memberProfile?.account_status === "active") {
            await admin.from("partner_memberships").update({ status: "active" }).eq("id", membership.id);
            await admin.from("profiles").update({ role: memberRole, updated_at: new Date().toISOString() }).eq("id", membership.user_id);
          }
        } else if (["suspended", "rejected", "pending_verification"].includes(nextStatus)) {
          await admin.from("partner_memberships").update({ status: "suspended" }).eq("id", membership.id);
          const { data: otherMemberships } = await admin.from("partner_memberships")
            .select("id").eq("user_id", membership.user_id).eq("partner_role", memberRole).eq("status", "active").neq("organization_id", organizationId).limit(1);
          if (!otherMemberships?.length) {
            await admin.from("profiles").update({ role: "rider", updated_at: new Date().toISOString() }).eq("id", membership.user_id);
          }
        }
      }
      await audit(admin, userId, "review_partner_organization", "partner_organization", organizationId, reason, organizationId, requestId);
      return respond(200, { ok: true, organization_id: organizationId, status: nextStatus, is_published: publish }, allowedOrigin);
    }

    if (action === "assign_internal_role") {
      if (role !== "platform_admin") return fail("platform_admin_required", 403, allowedOrigin);
      const targetUserId = textValue(body.user_id, 80);
      const targetRole = textValue(body.role, 40);
      const allowedRoles = new Set(["rider", "support_agent", "auditor", "analyst"]);
      if (!targetUserId || !targetRole || !allowedRoles.has(targetRole)) return fail("user_and_allowed_internal_role_required", 400, allowedOrigin);
      if (!validReason(body.reason)) return fail("internal_role_reason_required", 400, allowedOrigin);
      const { data: targetProfile } = await admin.from("profiles").select("id,role,account_status").eq("id", targetUserId).maybeSingle();
      if (!targetProfile || targetProfile.account_status !== "active") return fail("active_profile_required", 400, allowedOrigin);
      if (targetProfile.role === "platform_admin") return fail("platform_admin_role_change_requires_out_of_band_review", 409, allowedOrigin);
      const { error } = await admin.from("profiles").update({ role: targetRole, updated_at: new Date().toISOString() }).eq("id", targetUserId);
      if (error) return fail("internal_role_assignment_failed", 500, allowedOrigin);
      await audit(admin, userId, "assign_internal_role", "profile", targetUserId, String(body.reason), null, requestId);
      return respond(200, { ok: true, user_id: targetUserId, role: targetRole }, allowedOrigin);
    }

    if (action === "assign_partner_membership") {
      if (role !== "platform_admin") return fail("platform_admin_required", 403, allowedOrigin);
      const organizationId = textValue(body.organization_id, 80);
      const memberUserId = textValue(body.user_id, 80);
      const memberRole = textValue(body.partner_role, 40);
      if (!organizationId || !memberUserId || !memberRole || !Object.prototype.hasOwnProperty.call(partnerRoleOrganizationType, memberRole)) {
        return fail("organization_user_and_valid_partner_role_required", 400, allowedOrigin);
      }
      if (!validReason(body.reason)) return fail("membership_reason_required", 400, allowedOrigin);
      const { data: organization } = await admin.from("partner_organizations").select("id,partner_type,status").eq("id", organizationId).maybeSingle();
      if (!organization) return fail("partner_organization_not_found", 404, allowedOrigin);
      if (partnerRoleOrganizationType[memberRole] !== organization.partner_type) return fail("partner_role_does_not_match_organization_type", 400, allowedOrigin);
      const { data: memberProfile } = await admin.from("profiles").select("id,role,account_status").eq("id", memberUserId).maybeSingle();
      if (!memberProfile || memberProfile.account_status !== "active") return fail("active_profile_required", 400, allowedOrigin);
      if (memberProfile.role === "platform_admin") return fail("platform_admin_role_change_requires_out_of_band_review", 409, allowedOrigin);
      const active = organization.status === "verified";
      const { data: membership, error } = await admin.from("partner_memberships").upsert({
        user_id: memberUserId,
        organization_id: organizationId,
        partner_role: memberRole,
        status: active ? "active" : "pending",
      }, { onConflict: "user_id,organization_id" }).select("id,user_id,organization_id,partner_role,status").single();
      if (error || !membership) return fail("partner_membership_assignment_failed", 500, allowedOrigin);
      if (active) {
        const { error: profileUpdateError } = await admin.from("profiles")
          .update({ role: memberRole, updated_at: new Date().toISOString() }).eq("id", memberUserId);
        if (profileUpdateError) return fail("membership_created_profile_role_update_failed", 500, allowedOrigin);
      }
      await audit(admin, userId, "assign_partner_membership", "partner_membership", membership.id, reason, organizationId, requestId);
      return respond(201, { ok: true, membership }, allowedOrigin);
    }

    if (action === "create_loan_product") {
      if (!actorCanUseRole(role, ["lender_officer"])) return fail("lender_access_required", 403, allowedOrigin);
      const organizationId = textValue(body.partner_id, 80);
      const name = textValue(body.name, 120);
      const description = textValue(body.description, 1000);
      const purpose = textValue(body.purpose, 120) || "general";
      const minAmount = body.min_amount === null || body.min_amount === undefined || body.min_amount === "" ? null : Number(body.min_amount);
      const maxAmount = body.max_amount === null || body.max_amount === undefined || body.max_amount === "" ? null : Number(body.max_amount);
      const minTerm = body.min_term_months === null || body.min_term_months === undefined || body.min_term_months === "" ? null : Number(body.min_term_months);
      const maxTerm = body.max_term_months === null || body.max_term_months === undefined || body.max_term_months === "" ? null : Number(body.max_term_months);
      const terms = body.published_terms && typeof body.published_terms === "object" && !Array.isArray(body.published_terms) ? body.published_terms : {};
      if (!organizationId || !name || name.length < 2 ||
          (minAmount !== null && (!Number.isFinite(minAmount) || minAmount <= 0)) ||
          (maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount <= 0)) ||
          (minAmount !== null && maxAmount !== null && minAmount > maxAmount) ||
          (minTerm !== null && (!Number.isInteger(minTerm) || minTerm < 1 || minTerm > 120)) ||
          (maxTerm !== null && (!Number.isInteger(maxTerm) || maxTerm < 1 || maxTerm > 120)) ||
          (minTerm !== null && maxTerm !== null && minTerm > maxTerm)) return fail("invalid_loan_product_fields", 400, allowedOrigin);
      const { data: organization } = await admin.from("partner_organizations").select("id,partner_type,status").eq("id", organizationId).maybeSingle();
      if (!organization || organization.partner_type !== "lender" || organization.status !== "verified") return fail("verified_lender_organization_required", 403, allowedOrigin);
      if (!await authorizePartner(admin, userId, role, organizationId, "lender", "lender_officer")) return fail("partner_scope_denied", 403, allowedOrigin);
      const { data: product, error } = await admin.from("loan_products").insert({
        partner_id: organizationId, name, description, purpose,
        min_amount: minAmount, max_amount: maxAmount, min_term_months: minTerm, max_term_months: maxTerm,
        published_terms: terms, is_published: false,
      }).select("id,partner_id,name,description,purpose,min_amount,max_amount,min_term_months,max_term_months,is_published").single();
      if (error || !product) return fail("loan_product_create_failed", 500, allowedOrigin);
      await audit(admin, userId, "create_loan_product", "loan_product", product.id, reason, organizationId, requestId);
      return respond(201, { ok: true, product }, allowedOrigin);
    }

    if (action === "create_insurance_product") {
      if (!actorCanUseRole(role, ["insurer_officer"])) return fail("insurer_access_required", 403, allowedOrigin);
      const organizationId = textValue(body.partner_id, 80);
      const name = textValue(body.name, 120);
      const coverageType = textValue(body.coverage_type, 100);
      const description = textValue(body.description, 1000);
      const exclusions = textValue(body.exclusions, 3000);
      const premiumBasis = textValue(body.premium_basis, 100) || "quote_required";
      const supportsMonthly = body.supports_monthly_payments === true;
      const terms = body.terms && typeof body.terms === "object" && !Array.isArray(body.terms) ? body.terms : {};
      if (!organizationId || !name || name.length < 2 || !coverageType) return fail("invalid_insurance_product_fields", 400, allowedOrigin);
      const { data: organization } = await admin.from("partner_organizations").select("id,partner_type,status").eq("id", organizationId).maybeSingle();
      if (!organization || organization.partner_type !== "insurer" || organization.status !== "verified") return fail("verified_insurer_organization_required", 403, allowedOrigin);
      if (!await authorizePartner(admin, userId, role, organizationId, "insurer", "insurer_officer")) return fail("partner_scope_denied", 403, allowedOrigin);
      const { data: product, error } = await admin.from("insurance_products").insert({
        partner_id: organizationId, name, coverage_type: coverageType, description, exclusions,
        premium_basis: premiumBasis, supports_monthly_payments: supportsMonthly, terms, is_published: false,
      }).select("id,partner_id,name,description,coverage_type,exclusions,premium_basis,supports_monthly_payments,terms,is_published").single();
      if (error || !product) return fail("insurance_product_create_failed", 500, allowedOrigin);
      await audit(admin, userId, "create_insurance_product", "insurance_product", product.id, reason, organizationId, requestId);
      return respond(201, { ok: true, product }, allowedOrigin);
    }

    if (action === "publish_partner_product") {
      if (role !== "platform_admin") return fail("platform_admin_required", 403, allowedOrigin);
      const productType = textValue(body.product_type, 20);
      const productId = textValue(body.product_id, 80);
      if (!productType || !productId || !["loan", "insurance"].includes(productType) || typeof body.is_published !== "boolean" || !validReason(body.reason)) return fail("product_type_id_publish_boolean_and_reason_required", 400, allowedOrigin);
      const tableName = productType === "loan" ? "loan_products" : "insurance_products";
      const { data: product } = await admin.from(tableName).select("id,partner_id").eq("id", productId).maybeSingle();
      if (!product) return fail("partner_product_not_found", 404, allowedOrigin);
      const { data: organization } = await admin.from("partner_organizations").select("id,status,is_published").eq("id", product.partner_id).maybeSingle();
      if (!organization || organization.status !== "verified") return fail("verified_partner_required", 403, allowedOrigin);
      if (body.is_published === true && organization.is_published !== true) return fail("partner_organization_must_be_published_first", 409, allowedOrigin);
      const { error } = await admin.from(tableName).update({ is_published: body.is_published, updated_at: new Date().toISOString() }).eq("id", productId);
      if (error) return fail("partner_product_publish_failed", 500, allowedOrigin);
      await audit(admin, userId, "publish_partner_product", productType + "_product", productId, reason, product.partner_id, requestId);
      return respond(200, { ok: true, product_id: productId, is_published: body.is_published }, allowedOrigin);
    }

    if (action === "list_queue") {
      if (!actorCanUseRole(role, ["lender_officer", "insurer_officer", "support_agent"])) {
        return fail("operations_access_denied", 403, allowedOrigin);
      }
      return respond(200, { ok: true, queue: await loadQueue(admin, userId, role) }, allowedOrigin);
    }

    if (action === "respond_to_loan_offer") {
      const offerId = textValue(body.offer_id, 80);
      const decision = textValue(body.decision, 20);
      if (!offerId || !["accepted", "declined"].includes(decision || "")) return fail("offer_id_and_valid_decision_required", 400, allowedOrigin);
      const { data: offer } = await admin.from("loan_offers")
        .select("id,application_id,partner_id,status,expires_at,principal_amount,total_repayment,term_months")
        .eq("id", offerId).maybeSingle();
      if (!offer) return fail("offer_not_found", 404, allowedOrigin);
      const { data: application } = await admin.from("loan_applications")
        .select("id,user_id,status").eq("id", offer.application_id).maybeSingle();
      if (!application || application.user_id !== userId) return fail("offer_not_found", 404, allowedOrigin);
      if (offer.status !== "offered" || application.status !== "offer_available") return fail("offer_no_longer_available", 409, allowedOrigin);
      if (offer.expires_at && Date.parse(offer.expires_at) <= Date.now()) {
        await admin.from("loan_offers").update({ status: "expired" }).eq("id", offerId).eq("status", "offered");
        return fail("offer_expired", 409, allowedOrigin);
      }
      const { data: updatedOffer, error: updateOfferError } = await admin.from("loan_offers")
        .update({ status: decision }).eq("id", offerId).eq("status", "offered")
        .select("id,status,principal_amount,total_repayment,term_months").maybeSingle();
      if (updateOfferError || !updatedOffer) return fail("offer_decision_conflict", 409, allowedOrigin);
      const applicationStatus = decision === "accepted" ? "accepted_by_applicant" : "declined_by_applicant";
      const { error: updateApplicationError } = await admin.from("loan_applications")
        .update({ status: applicationStatus, updated_at: new Date().toISOString() }).eq("id", application.id);
      if (updateApplicationError) return respond(500, { error: "offer_decided_but_application_update_failed", offer: updatedOffer }, allowedOrigin);
      const actorReason = decision === "accepted" ? "Applicant accepted the written lender offer." : "Applicant declined the written lender offer.";
      await audit(admin, userId, "respond_to_loan_offer", "loan_offer", offerId, actorReason, offer.partner_id, requestId);
      return respond(200, {
        ok: true,
        offer: updatedOffer,
        application_status: applicationStatus,
        message: decision === "accepted"
          ? "Offer acceptance recorded. The lender must complete agreement and disbursement steps."
          : "Offer declined. No money was moved.",
      }, allowedOrigin);
    }

    if (action === "respond_to_quote_request") {
      if (!actorCanUseRole(role, ["insurer_officer"])) return fail("insurer_access_required", 403, allowedOrigin);
      const quoteRequestId = textValue(body.quote_request_id, 80);
      const nextStatus = textValue(body.status, 80);
      const validStatuses = new Set(["under_review", "information_requested", "quote_available", "declined", "expired"]);
      if (!quoteRequestId || !nextStatus || !validStatuses.has(nextStatus)) return fail("invalid_quote_request_or_status", 400, allowedOrigin);
      if (["declined", "expired"].includes(nextStatus) && !validReason(body.reason)) return fail("decision_reason_required", 400, allowedOrigin);
      const { data: quoteRequest } = await admin.from("insurance_quote_requests")
        .select("id,product_id,status").eq("id", quoteRequestId).maybeSingle();
      if (!quoteRequest?.product_id) return fail("quote_request_not_routed_to_insurer", 404, allowedOrigin);
      const { data: product } = await admin.from("insurance_products").select("partner_id").eq("id", quoteRequest.product_id).maybeSingle();
      if (!product || !await authorizePartner(admin, userId, role, product.partner_id, "insurer", "insurer_officer")) return fail("partner_scope_denied", 403, allowedOrigin);
      if (["accepted", "declined", "expired", "cancelled"].includes(quoteRequest.status)) return fail("quote_request_is_terminal", 409, allowedOrigin);
      const update: Json = { status: nextStatus, decision_reason: reason, updated_at: new Date().toISOString() };
      if (nextStatus === "quote_available") {
        const quotedPremium = positiveNumber(body.quoted_premium);
        const coverageMonths = Number(body.coverage_duration_months);
        const quotedTerms = body.quoted_terms;
        const expiry = textValue(body.quote_expires_at, 80);
        if (!quotedPremium || !Number.isInteger(coverageMonths) || coverageMonths < 1 || coverageMonths > 120 ||
            !quotedTerms || typeof quotedTerms !== "object" || Array.isArray(quotedTerms) ||
            !expiry || Number.isNaN(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()) {
          return fail("quote_requires_premium_duration_terms_and_future_expiry", 400, allowedOrigin);
        }
        update.quoted_premium = quotedPremium;
        update.coverage_duration_months = coverageMonths;
        update.quoted_terms = quotedTerms;
        update.quote_expires_at = expiry;
      }
      const { error } = await admin.from("insurance_quote_requests").update(update).eq("id", quoteRequestId);
      if (error) return fail("quote_request_update_failed", 500, allowedOrigin);
      await audit(admin, userId, "respond_to_quote_request", "insurance_quote_request", quoteRequestId, reason, product.partner_id, requestId);
      return respond(200, { ok: true, quote_request_id: quoteRequestId, status: nextStatus }, allowedOrigin);
    }

    if (action === "accept_insurance_quote") {
      const quoteRequestId = textValue(body.quote_request_id, 80);
      const acceptedReason = validReason(body.reason);
      if (!quoteRequestId || !acceptedReason) return fail("quote_request_id_and_reason_required", 400, allowedOrigin);
      const { data: quoteRequest } = await admin.from("insurance_quote_requests")
        .select("id,user_id,motorcycle_id,product_id,status,quoted_premium,coverage_duration_months,quoted_terms,quote_expires_at")
        .eq("id", quoteRequestId).maybeSingle();
      if (!quoteRequest || quoteRequest.user_id !== userId) return fail("quote_request_not_found", 404, allowedOrigin);
      if (quoteRequest.status === "accepted") {
        const { data: priorPolicy } = await admin.from("insurance_policies").select("id,status,policy_number,coverage_start,coverage_end")
          .eq("user_id", userId).contains("terms", { quote_request_id: quoteRequestId }).maybeSingle();
        if (priorPolicy) return respond(200, { ok: true, idempotent: true, policy: priorPolicy }, allowedOrigin);
      }
      if (quoteRequest.status !== "quote_available" || !quoteRequest.product_id || !quoteRequest.quoted_premium || !quoteRequest.coverage_duration_months) {
        return fail("quote_not_available_for_acceptance", 409, allowedOrigin);
      }
      if (quoteRequest.quote_expires_at && Date.parse(quoteRequest.quote_expires_at) <= Date.now()) {
        return fail("quote_expired", 409, allowedOrigin);
      }
      const { data: product } = await admin.from("insurance_products").select("partner_id").eq("id", quoteRequest.product_id).maybeSingle();
      if (!product) return fail("insurance_product_not_found", 404, allowedOrigin);
      const { data: priorPolicy } = await admin.from("insurance_policies").select("id,status,policy_number,coverage_start,coverage_end")
        .eq("user_id", userId).contains("terms", { quote_request_id: quoteRequestId }).maybeSingle();
      let policy = priorPolicy;
      if (!policy) {
        const { data: newPolicy, error } = await admin.from("insurance_policies").insert({
          user_id: userId,
          motorcycle_id: quoteRequest.motorcycle_id,
          product_id: quoteRequest.product_id,
          status: "awaiting_payment",
          terms: {
            quote_request_id: quoteRequestId,
            quoted_premium: quoteRequest.quoted_premium,
            coverage_duration_months: quoteRequest.coverage_duration_months,
            quote_terms: quoteRequest.quoted_terms,
            quote_expires_at: quoteRequest.quote_expires_at,
          },
        }).select("id,status,policy_number,coverage_start,coverage_end").single();
        if (error?.code === "23505") {
          // The unique quote_request_id index makes concurrent accept requests idempotent.
          const { data: racedPolicy, error: lookupError } = await admin.from("insurance_policies")
            .select("id,status,policy_number,coverage_start,coverage_end")
            .eq("user_id", userId).contains("terms", { quote_request_id: quoteRequestId }).maybeSingle();
          if (lookupError || !racedPolicy) return fail("pending_policy_create_conflict", 409, allowedOrigin);
          policy = racedPolicy;
        } else if (error || !newPolicy) {
          return fail("pending_policy_create_failed", 500, allowedOrigin);
        } else {
          policy = newPolicy;
        }
      }
      const { error: requestUpdateError } = await admin.from("insurance_quote_requests")
        .update({ status: "accepted", decision_reason: acceptedReason, updated_at: new Date().toISOString() })
        .eq("id", quoteRequestId).eq("user_id", userId);
      if (requestUpdateError) return respond(500, { error: "policy_created_quote_update_failed", policy_id: policy.id }, allowedOrigin);
      await audit(admin, userId, "accept_insurance_quote", "insurance_quote_request", quoteRequestId, acceptedReason, product.partner_id, requestId);
      return respond(201, { ok: true, policy, coverage_active: false, message: "Quote accepted. Policy remains pending payment and does not mean coverage is active." }, allowedOrigin);
    }

    if (action === "decline_insurance_quote") {
      const quoteRequestId = textValue(body.quote_request_id, 80);
      if (!quoteRequestId) return fail("quote_request_id_required", 400, allowedOrigin);
      const { data: quoteRequest } = await admin.from("insurance_quote_requests")
        .select("id,user_id,status,product_id").eq("id", quoteRequestId).maybeSingle();
      if (!quoteRequest || quoteRequest.user_id !== userId) return fail("quote_request_not_found", 404, allowedOrigin);
      if (quoteRequest.status !== "quote_available") return fail("quote_not_available_for_decline", 409, allowedOrigin);
      const { error } = await admin.from("insurance_quote_requests")
        .update({ status: "declined", decision_reason: "Applicant declined the quote.", updated_at: new Date().toISOString() })
        .eq("id", quoteRequestId).eq("user_id", userId);
      if (error) return fail("quote_decline_failed", 500, allowedOrigin);
      const organizationId = quoteRequest.product_id
        ? (await admin.from("insurance_products").select("partner_id").eq("id", quoteRequest.product_id).maybeSingle()).data?.partner_id || null
        : null;
      await audit(admin, userId, "decline_insurance_quote", "insurance_quote_request", quoteRequestId, "Applicant declined the quote.", organizationId, requestId);
      return respond(200, { ok: true, quote_request_id: quoteRequestId, status: "declined" }, allowedOrigin);
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
      const allowedNextStatuses = loanStatusTransitions[application.status] || [];
      if (!allowedNextStatuses.includes(nextStatus)) {
        return fail("invalid_loan_status_transition", 409, allowedOrigin);
      }
      if (nextStatus === "rejected_by_lender" && !validReason(body.reason)) return fail("rejection_reason_required", 400, allowedOrigin);
      const update: Json = {
        status: nextStatus,
        decided_at: ["approved_by_lender", "rejected_by_lender"].includes(nextStatus) ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      if (nextStatus === "disbursed") {
        const partnerReference = textValue(body.partner_reference, 160);
        if (!partnerReference || !validReason(body.reason)) {
          return fail("verified_external_disbursement_reference_and_reason_required", 400, allowedOrigin);
        }
        update.lender_reference = partnerReference;
      }
      const { error: updateError } = await admin.from("loan_applications").update(update)
        .eq("id", applicationId).eq("status", application.status);
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

    if (action === "list_ticket_messages") {
      const ticketId = textValue(body.ticket_id, 80);
      if (!ticketId) return fail("ticket_id_required", 400, allowedOrigin);
      const { data: ticket } = await admin.from("support_tickets")
        .select("id,user_id,status,assigned_to").eq("id", ticketId).maybeSingle();
      if (!ticket) return fail("ticket_not_found", 404, allowedOrigin);
      if (role === "rider" && ticket.user_id !== userId) return fail("ticket_not_found", 404, allowedOrigin);
      if (role === "support_agent" && ticket.assigned_to && ticket.assigned_to !== userId) return fail("ticket_assigned_to_another_agent", 403, allowedOrigin);
      if (!["rider", "support_agent", "platform_admin"].includes(role)) return fail("support_access_required", 403, allowedOrigin);
      const { data: messages, error } = await admin.from("support_messages")
        .select("id,ticket_id,author_id,body,created_at")
        .eq("ticket_id", ticketId).order("created_at", { ascending: true }).limit(500);
      if (error) return fail("support_messages_load_failed", 500, allowedOrigin);
      return respond(200, { ok: true, ticket_id: ticketId, status: ticket.status, assigned_to: ticket.assigned_to, messages: messages || [] }, allowedOrigin);
    }

    if (action === "reply_to_support_ticket") {
      if (!["rider", "support_agent", "platform_admin"].includes(role)) return fail("support_reply_access_required", 403, allowedOrigin);
      const ticketId = textValue(body.ticket_id, 80);
      const message = textValue(body.message, 5000);
      if (!ticketId || !message || message.length < 1) return fail("ticket_id_and_message_required", 400, allowedOrigin);
      const { data: ticket } = await admin.from("support_tickets")
        .select("id,user_id,status,assigned_to,subject").eq("id", ticketId).maybeSingle();
      if (!ticket) return fail("ticket_not_found", 404, allowedOrigin);
      if (["resolved", "closed"].includes(ticket.status)) return fail("ticket_is_closed", 409, allowedOrigin);
      const isRiderReply = role === "rider";
      if (isRiderReply && ticket.user_id !== userId) return fail("ticket_not_found", 404, allowedOrigin);
      if (role === "support_agent" && ticket.assigned_to && ticket.assigned_to !== userId) return fail("ticket_assigned_to_another_agent", 403, allowedOrigin);
      const { data: savedMessage, error: insertError } = await admin.from("support_messages").insert({
        ticket_id: ticketId, author_id: userId, body: message,
      }).select("id,ticket_id,author_id,body,created_at").single();
      if (insertError || !savedMessage) return fail("support_reply_insert_failed", 500, allowedOrigin);
      const nextStatus = isRiderReply ? "awaiting_partner" : "awaiting_user";
      const ticketUpdate: Json = { status: nextStatus, updated_at: new Date().toISOString() };
      if (role === "support_agent") ticketUpdate.assigned_to = userId;
      const { error: updateError } = await admin.from("support_tickets").update(ticketUpdate).eq("id", ticketId);
      if (updateError) return respond(500, { error: "reply_saved_ticket_status_update_failed", message_id: savedMessage.id }, allowedOrigin);
      if (!isRiderReply) {
        await admin.from("notifications").insert({
          user_id: ticket.user_id,
          title: "MotoSave support replied",
          message: "A support agent replied to your request: " + ticket.subject,
          notification_type: "support_reply",
          action_path: "/support",
        });
      } else if (ticket.assigned_to) {
        await admin.from("notifications").insert({
          user_id: ticket.assigned_to,
          title: "Rider replied to a support request",
          message: "A rider added information to: " + ticket.subject,
          notification_type: "support_reply",
          action_path: "/operations",
        });
      }
      const auditReason = isRiderReply ? "Rider replied in a support ticket." : "Support agent replied in a support ticket.";
      await audit(admin, userId, "reply_to_support_ticket", "support_ticket", ticketId, auditReason, null, requestId);
      return respond(201, { ok: true, message: savedMessage, status: nextStatus }, allowedOrigin);
    }

    if (action === "assign_support_ticket") {
      if (!actorCanUseRole(role, ["support_agent"])) return fail("support_access_required", 403, allowedOrigin);
      const ticketId = textValue(body.ticket_id, 80);
      const nextStatus = textValue(body.status || "assigned", 80);
      if (!ticketId || !nextStatus || !ticketStatuses.has(nextStatus)) return fail("invalid_ticket_or_status", 400, allowedOrigin);
      const { data: ticket } = await admin.from("support_tickets").select("id,status,assigned_to").eq("id", ticketId).maybeSingle();
      if (!ticket) return fail("ticket_not_found", 404, allowedOrigin);
      if (["resolved", "closed"].includes(ticket.status)) return fail("ticket_is_closed", 409, allowedOrigin);
      if (role === "support_agent" && ticket.assigned_to && ticket.assigned_to !== userId) return fail("ticket_assigned_to_another_agent", 403, allowedOrigin);
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
