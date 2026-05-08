import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "sync-merchant-deals";
logVersion(FUNCTION_NAME);

// Valid deal_type values in the consumer app database
const VALID_DEAL_TYPES = ['event', 'special', 'offer'] as const;
type ValidDealType = typeof VALID_DEAL_TYPES[number];

// Zod schema for webhook payload validation
const MerchantDealSchema = z.object({
  id: z.string().uuid(),
  merchant_id: z.string().max(200).optional(),
  venue_id: z.string().min(1).max(500),
  venue_name: z.string().min(1).max(500),
  venue_address: z.string().max(1000).optional(),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  deal_type: z.string().min(1).max(100),
  starts_at: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  expires_at: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  active_days: z.array(z.number().int().min(0).max(6)).optional(),
  active: z.boolean(),
  image_url: z.string().url().max(2000).optional().nullable(),
  website_url: z.string().url().max(2000).optional().nullable(),
  neighborhood_id: z.string().uuid().optional().nullable(),
});

const WebhookPayloadSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  deal: MerchantDealSchema,
});

// Map incoming deal_type values to valid ones
function mapDealType(incomingType: string): ValidDealType {
  const normalized = incomingType.toLowerCase().trim();
  
  // Direct matches
  if (VALID_DEAL_TYPES.includes(normalized as ValidDealType)) {
    return normalized as ValidDealType;
  }
  
  // Map common variations
  const mappings: Record<string, ValidDealType> = {
    'deal': 'offer',
    'deals': 'offer',
    'discount': 'offer',
    'promo': 'offer',
    'promotion': 'offer',
    'happy_hour': 'special',
    'happyhour': 'special',
    'happy hour': 'special',
    'specials': 'special',
    'events': 'event',
    'show': 'event',
    'concert': 'event',
    'party': 'event',
  };
  
  return mappings[normalized] || 'offer'; // Default to 'offer' if unknown
}

type MerchantDeal = z.infer<typeof MerchantDealSchema>;
type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret
    const webhookSecret = req.headers.get('x-webhook-secret');
    const expectedSecret = Deno.env.get('JETBRIDGE_WEBHOOK_SECRET');

    if (!webhookSecret || webhookSecret !== expectedSecret) {
      console.error('Invalid or missing webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase with service role for bypassing RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawPayload = await req.json();
    
    // Validate webhook payload with zod
    const parseResult = WebhookPayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      console.error('Invalid webhook payload:', parseResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid payload format', 
          details: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const payload = parseResult.data;
    console.log(`Processing ${payload.action} for deal:`, payload.deal.id);

    const { action, deal } = payload;

    switch (action) {
      case 'create': {
        // Map and validate deal_type
        const mappedDealType = mapDealType(deal.deal_type);
        console.log(`Mapped deal_type "${deal.deal_type}" to "${mappedDealType}"`);
        
        // Insert new deal from merchant portal
        const { data, error } = await supabase
          .from('deals')
          .insert({
            id: deal.id, // Use the same ID from JET Bridge for sync
            venue_id: deal.venue_id,
            venue_name: deal.venue_name,
            venue_address: deal.venue_address,
            title: deal.title,
            description: deal.description,
            deal_type: mappedDealType,
            starts_at: deal.starts_at,
            expires_at: deal.expires_at,
            active_days: deal.active_days || [0, 1, 2, 3, 4, 5, 6],
            active: deal.active,
            image_url: deal.image_url,
            website_url: deal.website_url,
            neighborhood_id: deal.neighborhood_id,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating deal:', error);
          throw error;
        }

        console.log('Deal created successfully:', data.id);

        // Fire-and-forget push notification to subscribers
        if (deal.active) {
          fireDealPush(supabaseUrl, deal, 'New deal');
        }

        return new Response(
          JSON.stringify({ success: true, deal: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        // Map and validate deal_type
        const mappedDealType = mapDealType(deal.deal_type);
        console.log(`Mapped deal_type "${deal.deal_type}" to "${mappedDealType}"`);
        
        // Update existing deal
        const { data, error } = await supabase
          .from('deals')
          .update({
            venue_id: deal.venue_id,
            venue_name: deal.venue_name,
            venue_address: deal.venue_address,
            title: deal.title,
            description: deal.description,
            deal_type: mappedDealType,
            starts_at: deal.starts_at,
            expires_at: deal.expires_at,
            active_days: deal.active_days,
            active: deal.active,
            image_url: deal.image_url,
            website_url: deal.website_url,
            neighborhood_id: deal.neighborhood_id,
          })
          .eq('id', deal.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating deal:', error);
          throw error;
        }

        console.log('Deal updated successfully:', data.id);

        if (deal.active) {
          fireDealPush(supabaseUrl, deal, 'Updated deal');
        }

        return new Response(
          JSON.stringify({ success: true, deal: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        // Soft delete by setting active to false, or hard delete
        const { error } = await supabase
          .from('deals')
          .delete()
          .eq('id', deal.id);

        if (error) {
          console.error('Error deleting deal:', error);
          throw error;
        }

        console.log('Deal deleted successfully:', deal.id);
        return new Response(
          JSON.stringify({ success: true, deleted: deal.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
