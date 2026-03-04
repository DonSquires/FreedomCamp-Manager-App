/**
 * AI Vision Chat Edge Function
 * Proxies AI API requests for vision analysis, chat, and generation
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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
    const { model, messages, temperature, max_tokens } = await req.json();

    // Get AI credentials from environment
    const ONSPACE_AI_API_KEY = Deno.env.get('ONSPACE_AI_API_KEY');
    const ONSPACE_AI_BASE_URL = Deno.env.get('ONSPACE_AI_BASE_URL') || 'https://api.onspace.ai/v1';

    if (!ONSPACE_AI_API_KEY) {
      throw new Error('ONSPACE_AI_API_KEY not configured');
    }

    console.log('Calling AI service:', { model, messageCount: messages.length });

    // Call AI API
    const response = await fetch(`${ONSPACE_AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ONSPACE_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Service Error:', errorText);
      throw new Error(`AI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('AI Service Response:', { model, usage: data.usage });

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
