import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "security-findings-alert";
logVersion(FUNCTION_NAME);

const ADMIN_EMAILS = [
  "creativebreakroominfo@gmail.com",
  "hodgesb02@gmail.com",
  "ed43gamble@gmail.com",
];

const HIGH_SEVERITIES = new Set(["critical", "high", "error", "errr"]);

function esc(text: string): string {
  return String(text).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!
  ));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const { data: findings, error } = await supabase
      .from("admin_security_findings")
      .select("id, scanner_name, internal_id, title, severity, summary, status, updated_at");

    if (error) throw error;

    const { data: alerted } = await supabase
      .from("security_finding_alerts")
      .select("finding_id, status, alert_type");

    const alertedSet = new Set(
      (alerted ?? []).map((a: any) => `${a.finding_id}|${a.status}|${a.alert_type}`),
    );

    const toNotify: Array<{ f: any; alert_type: string }> = [];
    for (const f of findings ?? []) {
      const sev = String(f.severity ?? "").toLowerCase();
      const isHigh = HIGH_SEVERITIES.has(sev);
      const status = String(f.status ?? "open").toLowerCase();

      // New high-severity finding
      if (isHigh && status !== "fixed" && status !== "ignored") {
        const key = `${f.id}|${status}|new_high`;
        if (!alertedSet.has(key)) toNotify.push({ f, alert_type: "new_high" });
      }

      // Status change to fixed
      if (status === "fixed") {
        const key = `${f.id}|fixed|status_change`;
        if (!alertedSet.has(key)) toNotify.push({ f, alert_type: "status_change" });
      }
    }

    if (toNotify.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, notified: 0, total: findings?.length ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const resend = new Resend(resendKey);

    const rows = toNotify
      .map(({ f, alert_type }) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee"><strong>${esc(f.severity)}</strong></td>
          <td style="padding:8px;border-bottom:1px solid #eee">${esc(alert_type)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${esc(f.title ?? f.internal_id)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee"><code>${esc(f.internal_id)}</code></td>
          <td style="padding:8px;border-bottom:1px solid #eee">${esc(f.status)}</td>
        </tr>`)
      .join("");

    const html = `
      <h2>JET Security Findings Alert</h2>
      <p>${toNotify.length} finding${toNotify.length === 1 ? "" : "s"} require attention.</p>
      <table style="border-collapse:collapse;width:100%;font-family:system-ui">
        <thead><tr>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #333">Severity</th>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #333">Alert</th>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #333">Title</th>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #333">Internal ID</th>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #333">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;color:#666;font-size:12px">Review in the admin dashboard → Security.</p>
    `;

    const emailResp = await resend.emails.send({
      from: "JET Security <onboarding@resend.dev>",
      to: ADMIN_EMAILS,
      subject: `[JET Security] ${toNotify.length} finding${toNotify.length === 1 ? "" : "s"} to review`,
      html,
    });

    if ((emailResp as any).error) {
      console.error("Resend error:", (emailResp as any).error);
      return new Response(
        JSON.stringify({ error: "email_failed", details: (emailResp as any).error }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const logRows = toNotify.map(({ f, alert_type }) => ({
      finding_id: f.id,
      scanner_name: f.scanner_name,
      internal_id: f.internal_id,
      severity: f.severity,
      status: f.status,
      alert_type,
    }));
    const { error: insErr } = await supabase
      .from("security_finding_alerts")
      .insert(logRows);
    if (insErr) console.error("alert log insert error:", insErr);

    return new Response(
      JSON.stringify({ ok: true, notified: toNotify.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error(`${FUNCTION_NAME} error:`, e);
    return new Response(
      JSON.stringify({ error: e?.message ?? "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});