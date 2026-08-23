import { describe, it, expect } from "vitest";
import { rowToState, SUBSCRIPTION_TIERS } from "@/hooks/useSubscription";

/**
 * Covers the checkout → webhook → feature-unlock derivation.
 *
 * The Stripe webhook is the only writer of `public.subscribers`; the client
 * reads that row directly. These assertions pin the exact translation from a
 * stored row to the paywall state the UI gates on, so a webhook payload change
 * or an expiry-handling regression fails here rather than in production.
 */

const future = () => new Date(Date.now() + 30 * 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

describe("rowToState", () => {
  it("unlocks JET+ when the webhook writes an active row", () => {
    const state = rowToState({
      subscribed: true,
      tier: "jet_plus",
      product_id: SUBSCRIPTION_TIERS.jet_plus.productId,
      subscription_end: future(),
    });

    expect(state.subscribed).toBe(true);
    expect(state.tier).toBe("jet_plus");
    expect(state.product_id).toBe(SUBSCRIPTION_TIERS.jet_plus.productId);
  });

  it("unlocks JETx when the webhook writes the top tier", () => {
    const state = rowToState({
      subscribed: true,
      tier: "jetx",
      product_id: SUBSCRIPTION_TIERS.jetx.productId,
      subscription_end: future(),
    });

    expect(state.subscribed).toBe(true);
    expect(state.tier).toBe("jetx");
  });

  it("downgrades to free once the period has ended", () => {
    const state = rowToState({
      subscribed: true,
      tier: "jetx",
      product_id: SUBSCRIPTION_TIERS.jetx.productId,
      subscription_end: past(),
    });

    expect(state.subscribed).toBe(false);
    expect(state.tier).toBe("free");
    expect(state.product_id).toBeNull();
  });

  it("treats a cancelled row as free", () => {
    const state = rowToState({
      subscribed: false,
      tier: "jetx",
      product_id: SUBSCRIPTION_TIERS.jetx.productId,
      subscription_end: future(),
    });

    expect(state.subscribed).toBe(false);
    expect(state.tier).toBe("free");
  });

  it("falls back to free for an unrecognised tier string", () => {
    const state = rowToState({
      subscribed: true,
      tier: "enterprise_unknown",
      product_id: "prod_whatever",
      subscription_end: future(),
    });

    expect(state.tier).toBe("free");
  });

  it("treats a null end date as an open-ended active subscription", () => {
    const state = rowToState({
      subscribed: true,
      tier: "jet_plus",
      product_id: SUBSCRIPTION_TIERS.jet_plus.productId,
      subscription_end: null,
    });

    expect(state.subscribed).toBe(true);
    expect(state.tier).toBe("jet_plus");
  });
});
