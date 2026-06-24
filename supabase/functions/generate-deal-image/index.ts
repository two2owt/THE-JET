import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "generate-deal-image";
logVersion(FUNCTION_NAME);

// Input validation schema
const dealImageSchema = z.object({
  dealId: z.string().uuid('Invalid deal ID format'),
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  description: z.string().trim().min(1, 'Description is required').max(1000, 'Description must be less than 1000 characters'),
  dealType: z.string().max(50, 'Deal type must be less than 50 characters').optional()
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid or expired token');
    }

    // Check if user has admin role
    const { data: hasAdminRole, error: roleError } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (roleError) {
      console.error('Error checking role:', roleError);
      throw new Error('Failed to verify permissions');
    }

    if (!hasAdminRole) {
      throw new Error('Unauthorized: Admin role required to generate deal images');
    }

    const requestBody = await req.json();
    
    // Validate and sanitize input
    const validationResult = dealImageSchema.safeParse(requestBody);
    if (!validationResult.success) {
      throw new Error(`Invalid input: ${validationResult.error.errors.map(e => e.message).join(', ')}`);
    }
    
    const { dealId, title, description, dealType } = validationResult.data;
    console.log('Admin user generating image for deal:', dealId, title);

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Create a detailed prompt based on deal type
    let prompt = '';
    if (dealType === 'offer' && (description.toLowerCase().includes('beer') || description.toLowerCase().includes('drink'))) {
      prompt = `A professional, high-quality photo of craft cocktails and beers on a bar counter. ${description}. Warm lighting, appealing presentation, restaurant/bar setting. Ultra high resolution, commercial photography style.`;
    } else if (dealType === 'event' && description.toLowerCase().includes('music')) {
      prompt = `A vibrant photo of a live music venue with stage lights and crowd. ${description}. Atmospheric lighting, energetic vibe. Ultra high resolution.`;
    } else if (description.toLowerCase().includes('food') || description.toLowerCase().includes('tasting') || description.toLowerCase().includes('oyster')) {
      prompt = `A mouth-watering professional photo of gourmet food dishes. ${description}. Restaurant plating, natural lighting, high-end cuisine presentation. Ultra high resolution, food photography.`;
    } else if (description.toLowerCase().includes('whiskey') || description.toLowerCase().includes('cocktail')) {
      prompt = `A premium photo of artisan cocktails or whiskey glasses on a elegant bar. ${description}. Moody atmospheric lighting, sophisticated presentation. Ultra high resolution.`;
    } else {
      prompt = `A professional photo representing: ${title}. ${description}. High-end venue atmosphere, inviting ambiance. Ultra high resolution.`;
    }

    console.log('Using prompt:', prompt);

    // Generate image using Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    // Extract the generated image
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageUrl) {
      throw new Error('No image generated from AI');
    }

    // Upload the base64 image to Supabase Storage
    // (supabase client already initialized at the top for auth check)

    // Convert base64 to blob
    const base64Data = imageUrl.split(',')[1];
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    const fileName = `deals/${dealId}/${Date.now()}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, binaryData, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    // Update the deal with the image URL
    const { error: updateError } = await supabase
      .from('deals')
      .update({ image_url: publicUrl })
      .eq('id', dealId);

    if (updateError) {
      console.error('Error updating deal:', updateError);
      throw updateError;
    }

    console.log('Successfully generated and saved image:', publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: publicUrl
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error('Error generating deal image:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
