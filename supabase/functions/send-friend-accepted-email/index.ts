import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "send-friend-accepted-email";
logVersion(FUNCTION_NAME);

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);

interface FriendAcceptedEmailRequest {
  recipientUserId: string;
  accepterDisplayName: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Create Supabase admin client to access user emails
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { recipientUserId, accepterDisplayName }: FriendAcceptedEmailRequest = await req.json();

    console.log('Sending friend accepted email notification');
    console.log('Recipient user ID:', recipientUserId);
    console.log('Accepter display name:', accepterDisplayName);

    if (!recipientUserId || !accepterDisplayName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Verify the caller is the actual accepter
    const token = authHeader.replace('Bearer ', '');
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      console.error('Invalid auth token:', callerError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
    const callerId = callerData.user.id;

    // Verify an accepted connection exists where caller accepted recipient's request
    // (recipient originally sent the request: user_id=recipient, friend_id=caller)
    const { data: connection, error: connError } = await supabaseAdmin
      .from('user_connections')
      .select('id')
      .eq('user_id', recipientUserId)
      .eq('friend_id', callerId)
      .eq('status', 'accepted')
      .maybeSingle();
    if (connError || !connection) {
      console.error('No accepted connection from recipient to caller', connError);
      return new Response(
        JSON.stringify({ error: 'Forbidden: no accepted connection found' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Get recipient's email from auth.users using admin client
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(recipientUserId);

    if (userError || !userData?.user?.email) {
      console.error('Error fetching user email:', userError);
      return new Response(
        JSON.stringify({ error: 'Could not find recipient email' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    const recipientEmail = userData.user.email;
    console.log('Sending to:', recipientEmail);

    // Escape HTML in display name
    const escapedName = accepterDisplayName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const appUrl = 'https://jet-around.com';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <!-- Logo -->
            <div style="text-align: center; margin-bottom: 32px;">
              <img src="https://www.jet-around.com/jet-email-logo.png" alt="JET" style="width: 80px; height: auto;" />
            </div>
            
            <!-- Card -->
            <div style="background: linear-gradient(145deg, rgba(30, 30, 35, 0.95), rgba(20, 20, 25, 0.98)); border-radius: 16px; padding: 32px; border: 1px solid rgba(255, 255, 255, 0.1);">
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 16px 0; text-align: center;">
                You're Now Connected! 🤝
              </h1>
              
              <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
                <strong style="color: #34d399;">${escapedName}</strong> accepted your friend request!
              </p>
              
              <p style="color: #71717a; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; text-align: center;">
                You can now share deals and discover new spots together.
              </p>
              
              <!-- CTA Button -->
              <div style="text-align: center;">
                <a href="${appUrl}/social" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px;">
                  View Your Friends
                </a>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="text-align: center; margin-top: 32px;">
              <p style="color: #52525b; font-size: 12px; margin: 0;">
                You're receiving this because you have a JET account.
              </p>
              <p style="color: #52525b; font-size: 12px; margin: 8px 0 0 0;">
                © ${new Date().getFullYear()} JET. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: 'JET <onboarding@resend.dev>',
      to: [recipientEmail],
      subject: `${escapedName} accepted your friend request on JET!`,
      html,
    });

    if (emailError) {
      // Log the error but return success to not break the friend acceptance flow
      console.warn('Resend email not sent (domain not verified):', emailError);
      return new Response(
        JSON.stringify({ success: true, emailSkipped: true, reason: 'Email domain not verified' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    console.log('Friend accepted email sent successfully');

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    // Log but don't fail the request - email is a nice-to-have, not critical
    console.error('Error in friend accepted email function:', error);
    return new Response(
      JSON.stringify({ success: true, emailSkipped: true, reason: 'Email service error' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
