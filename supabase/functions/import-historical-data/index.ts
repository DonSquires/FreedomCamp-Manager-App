import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HistoricalRecord {
  id?: number; // Optional - unique ID
  title?: string; // Zone name
  recordeddate?: string; // Date in DD/MM/YYYY format
  rego?: string; // Plate number (THIS is the plate number!)
  note?: string; // Officer notes (optional)
  attachments?: number; // Number of attachments (optional)
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const { records } = await req.json() as { records: HistoricalRecord[] };

    if (!records || !Array.isArray(records) || records.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No records provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${records.length} historical records...`);

    // Get default organization (first active org)
    const { data: defaultOrg, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (orgError || !defaultOrg) {
      throw new Error('No active organization found');
    }

    // Get admin user for recorded_by
    const { data: adminUser, error: userError } = await supabase
      .from('user_profiles')
      .select('id')
      .in('role', ['admin', 'master'])
      .limit(1)
      .single();

    if (userError || !adminUser) {
      throw new Error('No admin user found');
    }

    // Get all zones for mapping
    const { data: zones, error: zonesError } = await supabase
      .from('zones')
      .select('id, name')
      .eq('is_active', true);

    if (zonesError) {
      throw new Error('Failed to fetch zones');
    }

    // Create zone mapping (case-insensitive)
    const zoneMap = new Map<string, string>();
    zones?.forEach(zone => {
      zoneMap.set(zone.name.toLowerCase(), zone.id);
    });

    const results = {
      total: records.length,
      successful: 0,
      failed: 0,
      errors: [] as any[],
      zonesNotFound: new Set<string>(),
      observations: [] as any[],
    };

    // Process each record
    for (const record of records) {
      try {
        // Clean and validate plate number (from REGO column!)
        const plateNumber = cleanPlateNumber(record.rego || '');
        if (!plateNumber || plateNumber.length < 2) {
          results.failed++;
          results.errors.push({
            record: record.id || 0,
            error: `Invalid plate number: ${record.rego || 'empty'}`,
          });
          continue;
        }

        // Parse date (DD/MM/YYYY format)
        const recordedDate = parseDate(record.recordeddate || '');
        if (!recordedDate) {
          results.failed++;
          results.errors.push({
            record: record.id || 0,
            error: `Invalid date format: ${record.recordeddate || 'empty'}`,
          });
          continue;
        }

        // Map location name to zone ID (with fallback to 'unknown')
        const locationName = (record.title || 'unknown').trim();
        const zoneId = findZoneId(locationName, zoneMap);

        if (!zoneId) {
          results.zonesNotFound.add(locationName);
          results.failed++;
          results.errors.push({
            record: record.id || 0,
            error: `Zone not found: ${locationName}`,
            plate: plateNumber,
          });
          continue;
        }

        // Clean note value (handle "NaN" string from Excel/pandas)
        const noteValue = record.note && 
                          record.note.trim() !== '' && 
                          record.note.toLowerCase() !== 'nan' 
          ? record.note.trim() 
          : '';

        // Create observation with all defaults for missing data
        const officerNotes = noteValue
          ? `${noteValue} (Imported from historical data ID: ${record.id || 'unknown'})`
          : `Imported from historical data (ID: ${record.id || 'unknown'})`;
        
        const { data: observation, error: obsError } = await supabase
          .from('vehicle_observations_v2')
          .insert({
            plate_number: plateNumber,
            organization_id: defaultOrg.id,
            zone_id: zoneId,
            recorded_by: adminUser.id,
            recorded_at: recordedDate,
            officer_notes: officerNotes,
            has_notes: true,
            self_contained: false, // Default - can be updated later
            vehicle_make: null, // Unknown - will be updated when officer sees vehicle
            vehicle_model: null,
            vehicle_color: null,
            vehicle_year: null,
          })
          .select()
          .single();

        if (obsError) {
          console.error(`Failed to create observation for ${plateNumber}:`, obsError);
          results.failed++;
          results.errors.push({
            record: record.id || 0,
            plate: plateNumber,
            error: obsError.message,
          });
        } else {
          results.successful++;
          results.observations.push({
            id: observation.observation_id,
            plate: plateNumber,
            zone: locationName,
            date: recordedDate,
          });
        }
      } catch (error) {
        console.error(`Error processing record ${record.id}:`, error);
        results.failed++;
        results.errors.push({
          record: record.id || 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Log import summary
    const { error: logError } = await supabase
      .from('import_history')
      .insert({
        organization_id: defaultOrg.id,
        imported_by: adminUser.id,
        import_type: 'historical_vehicle_log',
        file_name: 'Vehicle Log.xlsx',
        records_imported: results.successful,
        duplicates_skipped: 0,
        failed_records: results.failed,
        status: results.failed > 0 ? 'completed_with_errors' : 'completed',
        error_log: results.errors,
      });

    if (logError) {
      console.error('Failed to log import history:', logError);
    }

    console.log(`Import complete: ${results.successful} successful, ${results.failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: results.total,
          successful: results.successful,
          failed: results.failed,
          errors: results.errors,
          zonesNotFound: Array.from(results.zonesNotFound),
        },
        observations: results.observations,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper: Clean plate number (remove spaces, special chars)
function cleanPlateNumber(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// Helper: Parse date (handles YYYY-MM-DD and DD/MM/YYYY formats)
function parseDate(dateStr: string): string | null {
  try {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();

    // Try YYYY-MM-DD format first (ISO format)
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const date = new Date(trimmed + 'T12:00:00.000Z');
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    // Try DD/MM/YYYY format
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);

      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const date = new Date(year, month, day, 12, 0, 0);
        return date.toISOString();
      }
    }

    console.error('Could not parse date:', dateStr);
    return null;
  } catch (error) {
    console.error('Date parsing error:', error);
    return null;
  }
}

// Helper: Find zone ID by location name (fuzzy matching)
function findZoneId(locationName: string, zoneMap: Map<string, string>): string | null {
  let normalized = locationName.toLowerCase().trim();

  // Strip LINZ prefix if present (e.g., "LINZ - Jacksons Inlet" → "jacksons inlet")
  // Handle variations: "LINZ - ", "LINZ-", "LINZ - ", etc.
  normalized = normalized.replace(/^linz\s*-\s*/i, '');

  // Exact match
  if (zoneMap.has(normalized)) {
    return zoneMap.get(normalized)!;
  }

  // Partial match (location name contains zone name or vice versa)
  for (const [zoneName, zoneId] of zoneMap.entries()) {
    if (normalized.includes(zoneName) || zoneName.includes(normalized)) {
      return zoneId;
    }
  }

  // No match found
  return null;
}
