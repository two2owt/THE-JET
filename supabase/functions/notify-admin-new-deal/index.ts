import { Resend } from "https://esm.sh/resend@4.0.0";
import { logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "notify-admin-new-deal";
logVersion(FUNCTION_NAME);

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const hookSecret = Deno.env.get("NOTIFY_ADMIN_HOOK_SECRET");
const ADMIN_EMAIL = "creativebreakroominfo@gmail.com";

// HTML escape function to prevent XSS/injection
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify webhook secret to prevent unauthorized calls
    if (!hookSecret) {
      console.error("NOTIFY_ADMIN_HOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Verify Authorization header matches the secret
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader !== `Bearer ${hookSecret}`) {
      console.error("Authorization failed: invalid or missing token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      });
    }

    const payload = await req.json();
    const deal = payload.record;

    const subject = "New Deal Created";
    const safeSubject = escapeHtml(subject);
    
    const details: Record<string, string> = {
      "Deal Title": deal.title || "N/A",
      "Venue": deal.venue_name || "N/A",
      "Deal Type": deal.deal_type || "N/A",
      "Description": deal.description || "N/A",
      "Starts At": deal.starts_at ? new Date(deal.starts_at).toLocaleString() : "N/A",
      "Expires At": deal.expires_at ? new Date(deal.expires_at).toLocaleString() : "N/A",
    };

    const emailHtml = `
      <h2>${safeSubject}</h2>
      <p>A new deal has been created on JetStream.</p>
      <h3>Details:</h3>
      <ul>
        ${Object.entries(details)
          .map(([key, value]) => `<li><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</li>`)
          .join("")}
      </ul>
    `;

    const emailResponse = await resend.emails.send({
      from: "JetStream Notifications <onboarding@resend.dev>",
      to: [ADMIN_EMAIL],
      subject: `[JetStream Admin] ${safeSubject}`,
      html: emailHtml,
    });

    console.log("Admin notification sent successfully for new deal:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error in notify-admin-new-deal:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
