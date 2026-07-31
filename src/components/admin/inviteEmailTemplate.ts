export type InviteTemplate = {
  subject: string;
  html: string;
  redirectTo: string;
};

export const INVITE_TEMPLATE_STORAGE_KEY = "jet-admin-invite-template";

export const INVITE_PLACEHOLDERS = ["display_name", "email", "invite_url", "site_name"] as const;

export const DEFAULT_INVITE_TEMPLATE: InviteTemplate = {
  subject: "You're invited to {{site_name}}",
  html: `<div style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;padding:32px 24px;color:#111111">
  <h1 style="font-size:22px;margin:0 0 12px">Welcome to {{site_name}}, {{display_name}}</h1>
  <p style="font-size:15px;line-height:1.6;color:#55575d;margin:0 0 20px">
    Your account ({{email}}) is ready. Tap below to set your password and start finding live deals near you.
  </p>
  <a href="{{invite_url}}"
     style="display:inline-block;background:#C9A961;color:#0A0A0A;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">
    Accept invitation
  </a>
  <p style="font-size:12px;color:#8a8d93;margin:24px 0 0">
    If the button doesn't work, copy this link into your browser:<br />{{invite_url}}
  </p>
</div>`,
  redirectTo: "https://www.jet-around.com/",
};

export function loadInviteTemplate(): InviteTemplate {
  try {
    const raw = localStorage.getItem(INVITE_TEMPLATE_STORAGE_KEY);
    if (!raw) return DEFAULT_INVITE_TEMPLATE;
    const parsed = JSON.parse(raw) as Partial<InviteTemplate>;
    return {
      subject: parsed.subject || DEFAULT_INVITE_TEMPLATE.subject,
      html: parsed.html || DEFAULT_INVITE_TEMPLATE.html,
      redirectTo: parsed.redirectTo || DEFAULT_INVITE_TEMPLATE.redirectTo,
    };
  } catch {
    return DEFAULT_INVITE_TEMPLATE;
  }
}

export function saveInviteTemplate(tpl: InviteTemplate) {
  try {
    localStorage.setItem(INVITE_TEMPLATE_STORAGE_KEY, JSON.stringify(tpl));
  } catch {
    /* storage unavailable — template stays session-only */
  }
}

/** Mirrors the edge function's `{{var}}` substitution for the preview pane. */
export function renderInvitePreview(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}