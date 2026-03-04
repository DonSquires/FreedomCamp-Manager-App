import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { corsHeaders } from '../_shared/cors.ts';

interface PlateRecognizerResponse {
  results: Array<{
    plate: string;
    confidence: number;
    region?: {
      code: string;
    };
    vehicle?: {
      type?: string;
      make?: Array<{ name: string; confidence: number }>;
      color?: Array<{ name: string; confidence: number }>;
    };
  }>;
  processing_time: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image_base64 } = await req.json();

    if (!image_base64) {
      return new Response(
        JSON.stringify({ error: 'Missing image_base64 parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🚗 Calling PlateRecognizer API...');

    // Get API token from environment
    const apiToken = Deno.env.get('PLATE_RECOGNIZER_API_TOKEN');
    if (!apiToken) {
      throw new Error('PLATE_RECOGNIZER_API_TOKEN not configured');
    }

    // Call PlateRecognizer API
    const response = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        upload: image_base64,
        regions: ['nz'], // New Zealand plates
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PlateRecognizer API error:', response.status, errorText);
      throw new Error(`PlateRecognizer API error: ${response.status}`);
    }

    const data: PlateRecognizerResponse = await response.json();
    
    console.log(`✅ PlateRecognizer processed in ${data.processing_time}ms`);

    // Parse results
    if (!data.results || data.results.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          plateNumber: null,
          confidence: 0,
          message: 'No plate detected',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = data.results[0];
    
    // Extract vehicle details
    const vehicleMake = result.vehicle?.make?.[0]?.name || null;
    const vehicleColor = result.vehicle?.color?.[0]?.name || null;

    return new Response(
      JSON.stringify({
        success: true,
        plateNumber: result.plate.toUpperCase(),
        confidence: result.confidence,
        vehicleMake,
        vehicleColor,
        vehicleType: result.vehicle?.type || null,
        region: result.region?.code || null,
        processingTime: data.processing_time,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in recognize-plate function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
