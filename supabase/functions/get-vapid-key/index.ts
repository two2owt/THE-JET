import { corsHeaders, logVersion } from "../_shared/cors.ts";
import { notConfigured } from "../_shared/http.ts";

const FUNCTION_NAME = "get-vapid-key";
logVersion(FUNCTION_NAME);

const b64urlToBytes = (s: string): Uint8Array => {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToB64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * True when `priv` is the mathematical pair of `pub`. Serving a public key
 * that does not pair with the signing key produces subscriptions every push
 * provider rejects with 403 VapidPkHashMismatch, so we verify before serving.
 */
async function vapidPairs(pub: string, priv: string): Promise<boolean> {
  try {
    const p = b64urlToBytes(pub);
    if (p.length !== 65 || p[0] !== 4) return false;
    const x = bytesToB64url(p.slice(1, 33));
    const y = bytesToB64url(p.slice(33, 65));
    const d = priv.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const alg = { name: "ECDSA", namedCurve: "P-256" } as const;
    const privKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x, y, d, ext: true },
      alg,
      false,
      ["sign"],
    );
    const pubKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x, y, ext: true },
      alg,
      false,
      ["verify"],
    );
    const msg = new TextEncoder().encode("vapid-pair-check");
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privKey,
      msg,
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      sig,
      msg,
    );
  } catch {
    return false;
  }
}

/**
 * Returns the VAPID *public* key used by the browser to create a Push
 * subscription. This value is public by design (it ships in every push
 * subscription request) — the private key never leaves the backend.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const primary = Deno.env.get("VITE_VAPID_PUBLIC_KEY") ?? "";
  const legacy = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

  let publicKey = primary || legacy;

  if (priv && primary && legacy && primary !== legacy) {
    if (!(await vapidPairs(primary, priv)) && (await vapidPairs(legacy, priv))) {
      console.warn(
        `[${FUNCTION_NAME}] VITE_VAPID_PUBLIC_KEY does not pair with the signing key; serving VAPID_PUBLIC_KEY`,
      );
      publicKey = legacy;
    }
  }

  if (!publicKey) {
    console.error("No VAPID public key is configured");
    return notConfigured("VAPID public key not configured");
  }

  return new Response(JSON.stringify({ publicKey }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      // Short cache: a key change must reach browsers quickly so stale
      // subscriptions can be rebuilt.
      "Cache-Control": "public, max-age=300",
    },
  });
});
