// Stripe webhook — server-authoritative subscription state.
// Verifies Stripe signature, then upserts public.subscribers so the app
// no longer has to poll Stripe on every check-subscription call.
//
// Configure in Stripe dashboard with events:
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//
// Public URL (no JWT required — Stripe signs the payload):
//   https://<project-ref>.functions.supabase.co/stripe-webhook
// Set STRIPE_WEBHOOK_SECRET in the edge-function secrets store.

import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "stripe-webhook";
logVersion(FUNCTION_NAME);

// Keep in sync with check-subscription/index.ts.
const TIER_MAP: Record<string, string> = {
  "prod_TZO4ZimXhwOsHJ": "jet_plus",
  "prod_TZO4046HaI8g2t": "jetx",
  "prod_TUHQC9j6XgrHOV": "jet_plus",
  "prod_TUHQzyndNlfBAr": "jetx",
};

const log = (step: string, details?: unknown) => {
  const suffix = details === undefined ? "" : ` - ${JSON.stringify(details)}`;
  console.log(`[STRIPE-WEBHOOK] ${step}${suffix}`);
};

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

async function resolveUserIdForCustomer(
  customerId: string,
  fallbackEmail: string | null,
): Promise<{ userId: string | null; email: string | null }> {
  // 1) Look up an existing subscribers row keyed on stripe_customer_id.
  const { data: existing } = await supabase
    .from("subscribers")
    .select("user_id, email")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (existing?.user_id) return { userId: existing.user_id, email: existing.email };

  // 2) Fall back to matching the Stripe customer email against auth.users.
  let email = fallbackEmail;
  if (!email) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!("deleted" in customer) || !customer.deleted) {
        email = (customer as Stripe.Customer).email ?? null;
      }
    } catch (err) {
      log("customer_retrieve_failed", { customerId, err: String(err) });
    }
  }
  if (!email) return { userId: null, email: null };

  const { data: userId, error: rpcError } = await supabase.rpc(
    "get_user_id_by_email",
    { _email: email },
  );
  if (rpcError) log("get_user_id_by_email_failed", { err: rpcError.message });
  return { userId: (userId as string | null) ?? null, email };
}

async function upsertFromSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { userId, email } = await resolveUserIdForCustomer(customerId, null);
  if (!userId || !email) {
    log("skip_unresolved_user", { customerId, subscriptionId: sub.id });
    return;
  }

  const productId = sub.items.data[0]?.price.product as string | undefined;
  const tier = (productId && TIER_MAP[productId]) || "free";
  const active = sub.status === "active" || sub.status === "trialing";

  const { error } = await supabase.from("subscribers").upsert(
    {
      user_id: userId,
      email,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      product_id: productId ?? null,
      tier: active ? tier : "free",
      subscribed: active,
      subscription_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) log("upsert_error", { error: error.message });
  else log("upsert_ok", { userId, tier, active });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id ?? null;
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;
  if (!customerId || !subscriptionId) {
    log("checkout_missing_ids", { customerId, subscriptionId });
    return;
  }
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  await upsertFromSubscription(sub);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!stripeKey || !webhookSecret) {
    log("missing_secrets", {
      hasStripeKey: Boolean(stripeKey),
      hasWebhookSecret: Boolean(webhookSecret),
    });
    return new Response("Not configured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    log("signature_verification_failed", { err: String(err) });
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await upsertFromSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        log("unhandled_event", { type: event.type });
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    log("handler_error", { type: event.type, err: String(err) });
    // Return 500 so Stripe retries.
    return new Response("Handler error", { status: 500 });
  }
});