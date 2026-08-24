import { useEffect } from "react";

/**
 * Renders nothing and forwards the visitor to a real auth route, preserving
 * the query string and the URL hash.
 *
 * Supabase puts recovery / confirmation tokens in the hash
 * (`#access_token=...&type=recovery`) and errors too
 * (`#error=access_denied&error_code=otp_expired`), so a plain server redirect
 * would silently drop them. We forward on the client instead, where both the
 * search string and the hash are still readable.
 *
 * Used by legacy / commonly-guessed auth URLs (`/login`, `/auth/callback`,
 * `/forgot-password`, …) that previously rendered the app's not-found screen.
 */
export const AuthAliasRedirect = ({ to }: { to: string }) => {
  useEffect(() => {
    const { search, hash } = window.location;
    // Merge the alias' query string into the target, keeping target params.
    const target = new URL(to, window.location.origin);
    if (search) {
      new URLSearchParams(search).forEach((value, key) => {
        if (!target.searchParams.has(key)) target.searchParams.set(key, value);
      });
    }
    if (hash) target.hash = hash;
    window.location.replace(target.toString());
  }, [to]);

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </div>
  );
};

export default AuthAliasRedirect;
