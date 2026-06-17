import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { corsHeaders, logVersion } from '../_shared/cors.ts';

logVersion('notify-new-message');

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);

interface Body {
  recipientUserId: string;
  conversationId: string;
  senderDisplayName: string;
  preview: string;
}

// Throttle: at most one in-app + email notification per (recipient, conversation)
// every THROTTLE_MINUTES — avoids spamming on rapid back-and-forth chat.
const THROTTLE_MINUTES = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const callerId = callerData.user.id;

    const body = (await req.json()) as Body;
    const { recipientUserId, conversationId, senderDisplayName, preview } = body;
    if (!recipientUserId || !conversationId || !senderDisplayName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    if (callerId === recipientUserId) {
      return new Response(JSON.stringify({ success: true, skipped: 'self' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Verify caller and recipient are an accepted connection.
    const { data: connection } = await supabaseAdmin
      .from('user_connections')
      .select('id')
      .eq('status', 'accepted')
      .or(
        `and(user_id.eq.${callerId},friend_id.eq.${recipientUserId}),and(user_id.eq.${recipientUserId},friend_id.eq.${callerId})`,
      )
      .maybeSingle();
    if (!connection) {
      return new Response(JSON.stringify({ error: 'Forbidden: not connected' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Throttle: skip if we already notified this recipient about this conversation recently.
    const sinceIso = new Date(Date.now() - THROTTLE_MINUTES * 60_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from('notification_logs')
      .select('id')
      .eq('user_id', recipientUserId)
      .eq('notification_type', `new_message:${conversationId}`)
      .gte('sent_at', sinceIso)
      .maybeSingle();
    if (recent) {
      return new Response(JSON.stringify({ success: true, throttled: true }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const safePreview = (preview || 'Sent you a message').slice(0, 140);

    // Always create the in-app notification.
    await supabaseAdmin.from('notification_logs').insert({
      user_id: recipientUserId,
      notification_type: `new_message:${conversationId}`,
      title: `New message from ${senderDisplayName}`,
      message: safePreview,
    });

    // Email gating
    const { data: pref } = await supabaseAdmin
      .from('user_preferences')
      .select('email_notifications_enabled')
      .eq('user_id', recipientUserId)
      .maybeSingle();
    if (pref && pref.email_notifications_enabled === false) {
      return new Response(JSON.stringify({ success: true, emailSkipped: true }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(recipientUserId);
    const recipientEmail = userData?.user?.email;
    if (!recipientEmail) {
      return new Response(JSON.stringify({ success: true, emailSkipped: true, reason: 'no email' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const escapedName = esc(senderDisplayName);
    const escapedPreview = esc(safePreview);
    const appUrl = 'https://jet-around.com';

    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
          <div style="text-align:center;margin-bottom:32px;">
            <img src="https://www.jet-around.com/jet-email-logo.png" alt="JET" style="width:80px;height:auto;" />
          </div>
          <div style="background:linear-gradient(145deg,rgba(30,30,35,0.95),rgba(20,20,25,0.98));border-radius:16px;padding:32px;border:1px solid rgba(255,255,255,0.1);">
            <h1 style="color:#fff;font-size:24px;font-weight:700;margin:0 0 16px;text-align:center;">New message 💬</h1>
            <p style="color:#a1a1aa;font-size:16px;line-height:1.6;margin:0 0 16px;text-align:center;">
              <strong style="color:#f472b6;">${escapedName}</strong> sent you a message on JET.
            </p>
            <p style="color:#d4d4d8;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;font-style:italic;">"${escapedPreview}"</p>
            <div style="text-align:center;">
              <a href="${appUrl}/messages" style="display:inline-block;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:12px;">Open chat</a>
            </div>
          </div>
          <div style="text-align:center;margin-top:32px;">
            <p style="color:#52525b;font-size:12px;margin:0;">You can turn off email notifications in Profile Settings.</p>
            <p style="color:#52525b;font-size:12px;margin:8px 0 0;">© ${new Date().getFullYear()} JET. All rights reserved.</p>
          </div>
        </div>
      </body></html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: 'JET <onboarding@resend.dev>',
      to: [recipientEmail],
      subject: `${escapedName} sent you a message on JET`,
      html,
    });
    if (emailError) {
      console.warn('Resend message email not sent:', emailError);
      return new Response(JSON.stringify({ success: true, emailSkipped: true, reason: 'resend error' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('notify-new-message error:', err);
    return new Response(JSON.stringify({ success: true, emailSkipped: true, reason: 'exception' }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});