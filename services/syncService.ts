import { supabase } from './supabase';
import { getDatabase, setSyncMetadata, getSyncMetadata } from './database';

export interface SyncData {
  zones: any[];
  compliance_matrix: any[];
  flagged_vehicles: any[];
  recent_observations: any[];
  vehicle_monthly_stays: any[];
  canonical_vehicles: any[];
  sync_timestamp: number;
}

/**
 * Download organization data package for offline operation
 */
export async function downloadOrganizationData(
  organizationId: string,
  daysBack: number = 7
): Promise<{ success: boolean; error?: string; data?: SyncData }> {
  try {
    console.log(`📥 Downloading data for organization ${organizationId} (last ${daysBack} days)...`);
    
    const lastSyncStr = await getSyncMetadata('last_sync');
    const lastSync = lastSyncStr ? parseInt(lastSyncStr) : null;
    
    // Call sync Edge Function
    const { data, error } = await supabase.functions.invoke('sync-organization-data', {
      body: {
        organization_id: organizationId,
        last_sync: lastSync,
        days_back: daysBack,
      },
    });
    
    if (error) {
      console.error('Sync error:', error);
      return { success: false, error: error.message };
    }
    
    console.log(`✅ Downloaded: ${data.zones?.length || 0} zones, ${data.flagged_vehicles?.length || 0} flagged vehicles, ${data.recent_observations?.length || 0} observations`);
    
    return {
      success: true,
      data: data as SyncData,
    };
  } catch (error: any) {
    console.error('Download error:', error);
    return {
      success: false,
      error: error.message || 'Failed to download data',
    };
  }
}

/**
 * Store downloaded data in local SQLite database
 */
export async function storeDataLocally(syncData: SyncData): Promise<void> {
  const db = getDatabase();
  
  try {
    console.log('💾 Storing data locally...');
    
    // Clear existing data
    await db.execAsync(`
      DELETE FROM zones;
      DELETE FROM compliance_matrix;
      DELETE FROM flagged_vehicles;
      DELETE FROM canonical_vehicles;
      DELETE FROM vehicle_monthly_stays;
      DELETE FROM recent_observations;
    `);
    
    // Insert Zones
    if (syncData.zones && syncData.zones.length > 0) {
      for (const zone of syncData.zones) {
        await db.runAsync(
          `INSERT INTO zones (id, organization_id, name, self_contained_required, nights_per_month, 
           max_consecutive_nights, day_visit_only, allowed_days, homeless_exemption, location_lat, 
           location_lng, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          zone.id,
          zone.organization_id,
          zone.name,
          zone.self_contained_required ? 1 : 0,
          zone.nights_per_month,
          zone.max_consecutive_nights,
          zone.day_visit_only ? 1 : 0,
          JSON.stringify(zone.allowed_days),
          zone.homeless_exemption ? 1 : 0,
          zone.location_lat,
          zone.location_lng,
          Date.now()
        );
      }
      console.log(`✓ Stored ${syncData.zones.length} zones`);
    }
    
    // Insert Compliance Matrix
    if (syncData.compliance_matrix && syncData.compliance_matrix.length > 0) {
      for (const matrix of syncData.compliance_matrix) {
        await db.runAsync(
          `INSERT INTO compliance_matrix (id, zone_id, version, effective_from, effective_to, 
           self_contained_required, nights_per_month, max_consecutive_nights, day_visit_only, 
           allowed_days, homeless_exemption) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          matrix.id,
          matrix.zone_id,
          matrix.version,
          new Date(matrix.effective_from).getTime(),
          matrix.effective_to ? new Date(matrix.effective_to).getTime() : null,
          matrix.self_contained_required ? 1 : 0,
          matrix.nights_per_month,
          matrix.max_consecutive_nights,
          matrix.day_visit_only ? 1 : 0,
          JSON.stringify(matrix.allowed_days),
          matrix.homeless_exemption ? 1 : 0
        );
      }
      console.log(`✓ Stored ${syncData.compliance_matrix.length} compliance matrices`);
    }
    
    // Insert Flagged Vehicles
    if (syncData.flagged_vehicles && syncData.flagged_vehicles.length > 0) {
      for (const flagged of syncData.flagged_vehicles) {
        await db.runAsync(
          `INSERT INTO flagged_vehicles (id, organization_id, plate_number, priority, reason, notes, 
           flagged_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          flagged.id,
          flagged.organization_id,
          flagged.plate_number,
          flagged.flagged_priority,
          flagged.flagged_reason,
          flagged.flagged_notes,
          new Date(flagged.flagged_at).getTime(),
          flagged.is_active ? 1 : 0
        );
      }
      console.log(`✓ Stored ${syncData.flagged_vehicles.length} flagged vehicles`);
    }
    
    // Insert Canonical Vehicles
    if (syncData.canonical_vehicles && syncData.canonical_vehicles.length > 0) {
      for (const vehicle of syncData.canonical_vehicles) {
        await db.runAsync(
          `INSERT INTO canonical_vehicles (plate_number, vehicle_make, vehicle_model, vehicle_year, 
           vehicle_color, self_contained, self_contained_expiry, homeless_status, is_flagged, 
           flagged_reason, last_seen_at, total_observations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          vehicle.plate_number,
          vehicle.vehicle_make,
          vehicle.vehicle_model,
          vehicle.vehicle_year,
          vehicle.vehicle_color,
          vehicle.self_contained ? 1 : 0,
          vehicle.self_contained_expiry ? new Date(vehicle.self_contained_expiry).getTime() : null,
          vehicle.homeless_status,
          vehicle.is_flagged ? 1 : 0,
          vehicle.flagged_reason,
          new Date(vehicle.last_seen_at).getTime(),
          vehicle.total_observations
        );
      }
      console.log(`✓ Stored ${syncData.canonical_vehicles.length} canonical vehicles`);
    }
    
    // Insert Vehicle Monthly Stays
    if (syncData.vehicle_monthly_stays && syncData.vehicle_monthly_stays.length > 0) {
      for (const stay of syncData.vehicle_monthly_stays) {
        await db.runAsync(
          `INSERT INTO vehicle_monthly_stays (id, plate_number, zone_id, calendar_month, nights_stayed, 
           consecutive_nights, last_observation_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          stay.id,
          stay.plate_number,
          stay.zone_id,
          new Date(stay.calendar_month).getTime(),
          stay.nights_stayed,
          stay.consecutive_nights,
          new Date(stay.last_observation_date).getTime()
        );
      }
      console.log(`✓ Stored ${syncData.vehicle_monthly_stays.length} vehicle stays`);
    }
    
    // Insert Recent Observations
    if (syncData.recent_observations && syncData.recent_observations.length > 0) {
      for (const obs of syncData.recent_observations) {
        await db.runAsync(
          `INSERT INTO recent_observations (observation_id, plate_number, zone_id, recorded_at, 
           recorded_by, self_contained, is_compliant, gps_latitude, gps_longitude) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          obs.observation_id,
          obs.plate_number,
          obs.zone_id,
          new Date(obs.recorded_at).getTime(),
          obs.recorded_by,
          obs.self_contained ? 1 : 0,
          obs.is_compliant ? 1 : 0,
          obs.gps_latitude,
          obs.gps_longitude
        );
      }
      console.log(`✓ Stored ${syncData.recent_observations.length} recent observations`);
    }
    
    // Update sync timestamp
    await setSyncMetadata('last_sync', syncData.sync_timestamp.toString());
    await setSyncMetadata('organization_id', syncData.zones[0]?.organization_id || '');
    
    console.log('✅ All data stored successfully');
  } catch (error) {
    console.error('❌ Error storing data locally:', error);
    throw error;
  }
}

/**
 * Get last sync timestamp
 */
export async function getLastSyncTime(): Promise<Date | null> {
  const timestamp = await getSyncMetadata('last_sync');
  return timestamp ? new Date(parseInt(timestamp)) : null;
}

/**
 * Check if local data is fresh (< 24 hours old)
 */
export async function isDataFresh(): Promise<boolean> {
  const lastSync = await getLastSyncTime();
  if (!lastSync) return false;
  
  const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
  return hoursSinceSync < 24;
}
