/**
 * NZSCV Status Checker Edge Function
 * Scrapes https://www.nzscv.co.nz to check vehicle self-contained certification
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { plate_number } = await req.json();

    if (!plate_number) {
      return new Response(
        JSON.stringify({ error: 'Plate number required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Checking NZSCV for plate:', plate_number);

    // Fetch NZSCV search page with plate number
    const searchUrl = `https://www.nzscv.co.nz/Search?card=card-2&plate=${encodeURIComponent(plate_number)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IronEagle/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.error('NZSCV fetch failed:', response.status);
      return new Response(
        JSON.stringify({ 
          found: false, 
          certified: false,
          error: 'NZSCV website unavailable' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();

    // Parse HTML to extract certification status
    // NZSCV page structure (approximate - may need adjustment):
    // - "Certified" or "Not certified" text
    // - Expiry date in format "DD/MM/YYYY"
    // - Certification number

    const isCertified = html.includes('Certified') && !html.includes('Not certified');
    
    // Extract expiry date using regex
    // Pattern: Expiry: DD/MM/YYYY or similar
    const expiryMatch = html.match(/Expiry[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const expiryDateNZ = expiryMatch ? expiryMatch[1] : null;

    // Convert NZ date format (DD/MM/YYYY) to ISO (YYYY-MM-DD)
    let expiryDateISO = null;
    if (expiryDateNZ) {
      const [day, month, year] = expiryDateNZ.split('/');
      expiryDateISO = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Extract certification number if available
    const certMatch = html.match(/Certificate[:\s]+([A-Z0-9-]+)/i);
    const certNumber = certMatch ? certMatch[1] : null;

    const result = {
      found: true,
      certified: isCertified,
      expiry_date: expiryDateISO,
      cert_number: certNumber,
      checked_at: new Date().toISOString(),
    };

    console.log('NZSCV result:', result);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('NZSCV check error:', error);
    
    return new Response(
      JSON.stringify({ 
        found: false, 
        certified: false,
        error: error.message || 'Failed to check NZSCV' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
