import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "scrape-venue-images";
logVersion(FUNCTION_NAME);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated admin caller — this function uses the service
    // role to mutate deals and consumes the paid Firecrawl quota.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: isAdmin, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: claimsData.claims.sub,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { dealId, websiteUrl } = await req.json();
    console.log('Scraping images for deal:', dealId, 'from:', websiteUrl);

    if (!dealId || !websiteUrl) {
      throw new Error('dealId and websiteUrl are required');
    }

    // Validate URL to prevent SSRF attacks
    try {
      const url = new URL(websiteUrl);
      
      // Only allow HTTPS
      if (url.protocol !== 'https:') {
        throw new Error('Only HTTPS URLs are allowed');
      }
      
      // Block private IP ranges and localhost
      const hostname = url.hostname;
      const privateIPRegex = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|localhost$|::1$|fe80:)/i;
      
      if (privateIPRegex.test(hostname)) {
        throw new Error('Private IP addresses and localhost are not allowed');
      }
      
      // Block IP addresses directly - require domain names
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (ipRegex.test(hostname)) {
        throw new Error('Direct IP addresses are not allowed. Please use a domain name.');
      }
      
    } catch (urlError) {
      console.error('URL validation error:', urlError);
      return new Response(
        JSON.stringify({ 
          error: urlError instanceof Error ? urlError.message : 'Invalid URL format' 
        }),
        { 
          status: 400,
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    // Scrape the website using Firecrawl
    console.log('Calling Firecrawl API...');
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: websiteUrl,
        formats: ['html'],
        onlyMainContent: false,
      }),
    });

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text();
      console.error('Firecrawl API error:', errorText);
      throw new Error(`Firecrawl API error: ${scrapeResponse.status}`);
    }

    const scrapeData = await scrapeResponse.json();
    console.log('Scrape successful, processing HTML...');

    // Extract images from HTML
    const html = scrapeData.data?.html || '';
    const imageRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    const images: string[] = [];
    let match;

    while ((match = imageRegex.exec(html)) !== null) {
      const imgSrc = match[1];
      // Filter for likely venue images (larger images, exclude icons/logos)
      if (!imgSrc.includes('icon') && 
          !imgSrc.includes('logo') && 
          !imgSrc.includes('favicon') &&
          (imgSrc.startsWith('http') || imgSrc.startsWith('//'))) {
        const fullUrl = imgSrc.startsWith('//') ? 'https:' + imgSrc : imgSrc;
        images.push(fullUrl);
      }
    }

    console.log(`Found ${images.length} potential venue images`);

    // Select the best image (first one, or could implement smarter selection)
    const selectedImage = images.length > 0 ? images[0] : null;

    if (selectedImage) {
      // Update the deal with the image URL
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error: updateError } = await supabase
        .from('deals')
        .update({ image_url: selectedImage })
        .eq('id', dealId);

      if (updateError) {
        console.error('Error updating deal:', updateError);
        throw updateError;
      }

      console.log('Successfully updated deal with image:', selectedImage);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: selectedImage,
        totalImagesFound: images.length 
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error('Error scraping venue images:', error);
    
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
