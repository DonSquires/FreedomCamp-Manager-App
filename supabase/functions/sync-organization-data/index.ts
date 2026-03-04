import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface SyncRequest {
  organization_id: string;
  last_sync: number | null;
  days_back: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { organization_id, last_sync, days_back = 7 }: SyncRequest = await req.json();

    console.log(`📥 Sync request for org ${organization_id}, days_back: ${days_back}`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days_back);

    // Fetch Zones (all active)
    const { data: zones, error: zonesError } = await supabaseClient
      .from('zones')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('is_active', true);

    if (zonesError) throw zonesError;

    // Fetch Compliance Matrix (current + last 3 versions per zone)
    const { data: complianceMatrix, error: matrixError } = await supabaseClient
      .from('zone_compliance_matrix')
      .select('*')
      .eq('organization_id', organization_id)
      .gte('version', 1)
      .order('version', { ascending: false });

    if (matrixError) throw matrixError;

    // Keep only current + last 3 versions per zone
    const matrixByZone = new Map();
    for (const matrix of complianceMatrix || []) {
      if (!matrixByZone.has(matrix.zone_id)) {
        matrixByZone.set(matrix.zone_id, []);
      }
      const zoneMatrices = matrixByZone.get(matrix.zone_id);
      if (zoneMatrices.length < 4) {
        zoneMatrices.push(matrix);
      }
    }
    const filteredMatrix = Array.from(matrixByZone.values()).flat();

    // Fetch Flagged Vehicles (last 90 days)
    const flaggedCutoff = new Date();
    flaggedCutoff.setDate(flaggedCutoff.getDate() - 90);

    const { data: flaggedVehicles, error: flaggedError } = await supabaseClient
      .from('canonical_vehicles')
      .select('*')
      .eq('is_flagged', true)
      .gte('flagged_at', flaggedCutoff.toISOString());

    if (flaggedError) throw flaggedError;

    // Fetch Recent Observations (last N days for this org)
    const { data: recentObservations, error: obsError } = await supabaseClient
      .from('vehicle_observations_v2')
      .select('observation_id, plate_number, zone_id, recorded_at, recorded_by, self_contained, is_compliant, gps_latitude, gps_longitude')
      .eq('organization_id', organization_id)
      .gte('recorded_at', cutoffDate.toISOString())
      .order('recorded_at', { ascending: false })
      .limit(1000);

    if (obsError) throw obsError;

    // Fetch Vehicle Monthly Stays (current month + last month)
    const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const lastMonth = new Date(currentMonth);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const { data: vehicleMonthlyStays, error: staysError } = await supabaseClient
      .from('vehicle_monthly_stays')
      .select('*')
      .eq('organization_id', organization_id)
      .gte('calendar_month', lastMonth.toISOString());

    if (staysError) throw staysError;

    // Fetch Canonical Vehicles (top 500 by observation count)
    const { data: canonicalVehicles, error: canonicalError } = await supabaseClient
      .from('canonical_vehicles')
      .select('plate_number, vehicle_make, vehicle_model, vehicle_year, vehicle_color, self_contained, self_contained_expiry, homeless_status, is_flagged, flagged_reason, last_seen_at, total_observations')
      .order('total_observations', { ascending: false })
      .limit(500);

    if (canonicalError) throw canonicalError;

    // Get user ID from auth header
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);
    const user_id = user?.id;

    // Fetch Investigation Jobs (assigned to this officer)
    const { data: investigationJobs, error: jobsError } = user_id ? await supabaseClient
      .from('investigation_jobs')
      .select('*')
      .eq('assigned_to', user_id)
      .eq('organization_id', organization_id)
      .in('status', ['pending', 'in-progress'])
      .order('due_date', { ascending: true })
      .limit(50) : { data: null, error: null };

    if (jobsError) console.error('Jobs fetch error:', jobsError);

    // Fetch Patrols (assigned to this officer, next 14 days)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);

    const { data: patrols, error: patrolsError } = user_id ? await supabaseClient
      .from('patrols')
      .select('*')
      .eq('assigned_to', user_id)
      .eq('organization_id', organization_id)
      .gte('patrol_date', cutoffDate.toISOString())
      .lte('patrol_date', futureDate.toISOString())
      .order('patrol_date', { ascending: true }) : { data: null, error: null };

    if (patrolsError) console.error('Patrols fetch error:', patrolsError);

    // Fetch Messages (last 50 messages for this officer)
    const { data: messages, error: messagesError } = user_id ? await supabaseClient
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${user_id},recipient_id.eq.${user_id}`)
      .order('timestamp', { ascending: false })
      .limit(50) : { data: null, error: null };

    if (messagesError) console.error('Messages fetch error:', messagesError);

    const syncData = {
      zones: zones || [],
      compliance_matrix: filteredMatrix,
      flagged_vehicles: flaggedVehicles || [],
      recent_observations: recentObservations || [],
      vehicle_monthly_stays: vehicleMonthlyStays || [],
      canonical_vehicles: canonicalVehicles || [],
      investigation_jobs: investigationJobs || [],
      patrols: patrols || [],
      messages: messages || [],
      sync_timestamp: Date.now(),
    };

    console.log(`✅ Sync complete: ${zones?.length} zones, ${recentObservations?.length} observations`);

    return new Response(JSON.stringify(syncData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
