/**
 * Branded one-to-one activation email used by the "Never signed in" admin
 * panel. Shared by the preview modal, the single-send path and the background
 * queue worker so what an admin previews is exactly what gets delivered.
 */

export const SITE_NAME = "JET";
export const ACTIVATION_REDIRECT = "https://jet-around.com/";

export const ACTIVATION_SUBJECT = "Your {{site_name}} account is ready — sign in";

export const ACTIVATION_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;padding:32px 24px;color:#111111">
  <h1 style="font-size:22px;margin:0 0 12px">Your {{site_name}} account is ready, {{display_name}}</h1>
  <p style="font-size:15px;line-height:1.6;color:#55575d;margin:0 0 20px">
    We created an account for {{email}} but you haven't signed in yet. Tap below to
    open {{site_name}} and see the live deals and events happening near you right now.
  </p>
  <a href="{{invite_url}}"
     style="display:inline-block;background:#C9A961;color:#0A0A0A;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">
    Sign in to {{site_name}}
  </a>
  <p style="font-size:12px;color:#8a8d93;margin:24px 0 0">
    If the button doesn't work, copy this link into your browser:<br />{{invite_url}}
  </p>
  <p style="font-size:12px;color:#8a8d93;margin:12px 0 0">
    This sign-in link is single-use and expires shortly.
  </p>
</div>`;

export interface NudgeTemplateVars {
  display_name: string;
  email: string;
  invite_url: string;
  site_name?: string;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderNudgeTemplate(
  tpl: string,
  vars: NudgeTemplateVars,
  escape: boolean,
): string {
  const merged: Record<string, string> = {
    site_name: SITE_NAME,
    ...vars,
  } as Record<string, string>;
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = merged[key] ?? "";
    return escape ? escapeHtml(v) : v;
  });
}

/** Subject + body exactly as the recipient will receive them. */
export function renderActivationEmail(vars: NudgeTemplateVars) {
  return {
    subject: renderNudgeTemplate(ACTIVATION_SUBJECT, vars, false),
    html: renderNudgeTemplate(ACTIVATION_HTML, vars, true),
  };
}
