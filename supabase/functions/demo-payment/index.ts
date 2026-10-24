import { createClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });

  // This function is a simulation, not a gateway. It must be enabled explicitly
  // in a non-production environment and is hard-disabled in production.
  if (Deno.env.get("MOTOSAVE_ENVIRONMENT") === "production" ||
      Deno.env.get("MOTOSAVE_DEMO_PAYMENTS_ENABLED") !== "true") {
    return response(403, { error: "demo_payments_disabled", message: "Demo payments are disabled." });
  }

  const authHeader = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader || !supabaseUrl || !publishableKey || !serviceRoleKey) {
    return response(401, { error: "unauthorized" });
  }

  let body: { installment_id?: string };
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "invalid_json" });
  }
  if (!body.installment_id || !/^[0-9a-f-]{36}$/i.test(body.installment_id)) {
    return response(400, { error: "invalid_installment_id" });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response(401, { error: "invalid_session" });
  const userId = authData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: installment, error: installmentError } = await admin
    .from("insurance_premium_installments")
    .select("id, policy_id, amount_due, status, provider_reference")
    .eq("id", body.installment_id)
    .maybeSingle();
  if (installmentError) return response(500, { error: "installment_lookup_failed" });
  if (!installment) return response(404, { error: "installment_not_found" });

  const { data: policy, error: policyError } = await admin
    .from("insurance_policies")
    .select("id, user_id")
    .eq("id", installment.policy_id)
    .maybeSingle();
  if (policyError) return response(500, { error: "policy_lookup_failed" });
  if (!policy || policy.user_id !== userId) return response(404, { error: "installment_not_found" });

  const idempotencyKey = "motosave-demo-premium:" + userId + ":" + installment.id;
  const { data: existing, error: existingError } = await admin
    .from("payment_transactions")
    .select("id, status, provider_reference, amount")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingError) return response(500, { error: "payment_lookup_failed" });

  if (["confirmed", "reversed", "cancelled"].includes(installment.status)) {
    return response(409, { error: "installment_not_simulatable", status: installment.status });
  }

  let paymentId = existing?.id as string | undefined;
  let providerReference = existing?.provider_reference as string | undefined;
  if (!existing) {
    providerReference = "DEMO-" + crypto.randomUUID();
    const { data: payment, error: insertError } = await admin
      .from("payment_transactions")
      .insert({
        user_id: userId,
        provider: "motosave-demo-simulator",
        provider_reference: providerReference,
        idempotency_key: idempotencyKey,
        purpose: "insurance_premium",
        related_entity_id: installment.id,
        amount: installment.amount_due,
        currency: "RWF",
        status: "simulated_confirmed",
        is_simulated: true,
        confirmed_at: new Date().toISOString(),
      })
      .select("id, provider_reference")
      .single();

    if (insertError) {
      // A concurrent duplicate can hit the unique idempotency key. Re-read rather than
      // blindly retrying a financial operation.
      const { data: raced } = await admin
        .from("payment_transactions")
        .select("id, provider_reference")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (!raced) return response(500, { error: "demo_transaction_not_recorded" });
      paymentId = raced.id;
      providerReference = raced.provider_reference;
    } else {
      paymentId = payment.id;
      providerReference = payment.provider_reference;
    }
  }

  // Simulation labels only. This never sends a provider request or moves real funds.
  const { error: updateError } = await admin
    .from("insurance_premium_installments")
    .update({
      status: "simulated_confirmed",
      provider_reference: providerReference,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", installment.id)
    .eq("policy_id", policy.id);

  if (updateError) return response(500, { error: "demo_status_update_failed", payment_id: paymentId });
  return response(200, {
    ok: true,
    demo: true,
    status: "simulated_confirmed",
    payment_id: paymentId,
    provider_reference: providerReference,
    message: "Demo only. No money moved and no insurance coverage was activated.",
  });
});
