import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function authClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  );
}

/**
 * Verifies a bearer token and returns the user id.
 * Tries local JWT claim verification first (fast, asymmetric keys), then falls
 * back to a server-side lookup so legacy/HS256 tokens or transient JWKS
 * failures don't produce a bogus 401 for genuinely signed-in users.
 */
export async function verifyToken(token: string): Promise<string | null> {
  if (!token) return null;
  const client = authClient();

  try {
    const { data, error } = await client.auth.getClaims(token);
    if (!error && data?.claims?.sub) return data.claims.sub as string;
  } catch {
    // fall through to getUser()
  }

  try {
    const { data, error } = await client.auth.getUser(token);
    if (!error && data?.user?.id) return data.user.id;
  } catch {
    // ignore
  }

  return null;
}

/** Extracts the bearer token from the request, if present. */
export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Requires a valid Supabase user JWT on the request.
 * Returns the user id when authenticated, or null when the caller is anonymous
 * or the token is invalid.
 */
export async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  return await verifyToken(token);
}
