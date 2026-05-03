import React from 'https://esm.sh/react@18.3.1';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { renderAsync } from 'https://esm.sh/@react-email/components@0.0.22';
import { VerificationEmail } from './_templates/verification-email.tsx';
import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "send-verification-email";
logVersion(FUNCTION_NAME);

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);
const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') as string;

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
    const payload = await req.text();
    const headers = Object.fromEntries(req.headers);
    
    // Check if hook secret is configured
    if (!hookSecret) {
      console.warn('SEND_EMAIL_HOOK_SECRET not configured - skipping webhook verification');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Hook secret not configured' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }
    
    let verifiedPayload;
    try {
      const wh = new Webhook(hookSecret);
      verifiedPayload = wh.verify(payload, headers) as {
        user: {
          email: string;
        };
        email_data: {
          token: string;
          token_hash: string;
          redirect_to: string;
          email_action_type: string;
        };
      };
    } catch (webhookError) {
      // Log but don't fail - webhook verification issues shouldn't block signup
      console.error('Webhook verification failed:', webhookError);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Webhook verification failed' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }
    
    const {
      user,
      email_data: { token, token_hash, redirect_to, email_action_type },
    } = verifiedPayload;

    console.log('Original redirect_to:', redirect_to);

    // Determine the app URL - use redirect_to if valid, otherwise default to Lovable domain
    let appUrl = redirect_to;
    if (!appUrl || appUrl.includes('localhost') || appUrl.includes('lovableproject.com')) {
      // Default to the custom domain
      appUrl = 'https://jet-around.com';
    }
    
    // Extract base URL properly
    const baseUrl = new URL(appUrl).origin;
    const customRedirectTo = `${baseUrl}/verification-success`;
    
    console.log('Using app URL:', baseUrl);
    console.log('Custom redirect to:', customRedirectTo);

    console.log('Sending verification email to:', user.email);
    console.log('Action type:', email_action_type);

    // Only send for signup verification emails
    if (email_action_type !== 'signup') {
      return new Response(
        JSON.stringify({ message: 'Not a signup verification email' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    const html = await renderAsync(
      React.createElement(VerificationEmail, {
        supabase_url: Deno.env.get('SUPABASE_URL') ?? '',
        token,
        token_hash,
        redirect_to: customRedirectTo,
        email_action_type,
      })
    );

    // Sender address. Defaults to the production verified domain
    // (noreply@jet-around.com). If you've verified a different subdomain
    // in Resend (e.g. mail.jet-around.com or send.jet-around.com), set
    // the `RESEND_FROM_EMAIL` secret in Lovable Cloud and it'll be used
    // verbatim — no redeploy required to swap senders.
    const fromAddress =
      Deno.env.get('RESEND_FROM_EMAIL') ?? 'JET <noreply@jet-around.com>';

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [user.email],
      subject: 'Verify your JET account',
      html,
    });

    if (error) {
      // Log but don't fail - email issues shouldn't block signup.
      // Surface a structured, user-facing message + retry hint so the
      // client (or admin tooling) can prompt the user to resend instead
      // of silently dropping the verification email.
      console.warn('Resend email not sent (domain not verified):', error);
      return new Response(
        JSON.stringify({
          success: true,
          emailSkipped: true,
          reason: 'email_domain_not_verified',
          userMessage:
            "We couldn't send your verification email right now (sender domain pending verification). Tap \"Resend verification email\" to try again, or contact support if it keeps failing.",
          canRetry: true,
          retryAfterSeconds: 30,
          supportEmail: 'support@jet-around.com',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    console.log('Verification email sent successfully');

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    // Log but don't fail - email is nice-to-have, not critical for signup.
    // Return a clear, actionable payload so callers can notify the user
    // and offer a retry instead of a silent skip.
    console.error('Error in verification email function:', error);
    return new Response(
      JSON.stringify({
        success: true,
        emailSkipped: true,
        reason: 'email_service_error',
        userMessage:
          "Your account was created, but we hit a snag sending the verification email. Tap \"Resend verification email\" to try again.",
        canRetry: true,
        retryAfterSeconds: 30,
        supportEmail: 'support@jet-around.com',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
});
