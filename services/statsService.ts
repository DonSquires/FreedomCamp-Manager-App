// Local statistics calculation service
// Queries SQLite database for real-time field statistics

import { getDatabase } from './database';
import { Platform } from 'react-native';

export interface DashboardStats {
  scansToday: number;
  breachesActive: number;
  incidentsOpen: number;
  flaggedVehicles: number;
  totalObservations: number;
  totalPhotos: number;
  recentScans: RecentScan[];
}

export interface RecentScan {
  plateNumber: string;
  recordedAt: string;
  isCompliant: boolean;
  zoneName: string;
}

/**
 * Get dashboard statistics from local database
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  if (Platform.OS === 'web') {
    return getMockStats();
  }

  try {
    const db = getDatabase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Scans today (observations recorded today)
    const scansResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM observations WHERE recorded_at >= ?',
      [todayISO]
    );
    const scansToday = scansResult?.count || 0;

    // Active breaches (non-compliant observations today)
    const breachesResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM observations WHERE recorded_at >= ? AND is_compliant = 0',
      [todayISO]
    );
    const breachesActive = breachesResult?.count || 0;

    // Flagged vehicles in database
    const flaggedResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM flagged_vehicles'
    );
    const flaggedVehicles = flaggedResult?.count || 0;

    // Total observations
    const totalObsResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM observations'
    );
    const totalObservations = totalObsResult?.count || 0;

    // Total photos
    const totalPhotosResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM photos'
    );
    const totalPhotos = totalPhotosResult?.count || 0;

    // Recent scans (last 5)
    const recentScans = await db.getAllAsync<any>(
      `SELECT 
        o.plate_number,
        o.recorded_at,
        o.is_compliant,
        z.name as zone_name
      FROM observations o
      LEFT JOIN zones z ON o.zone_id = z.id
      ORDER BY o.recorded_at DESC
      LIMIT 5`
    );

    const recentScansFormatted: RecentScan[] = recentScans.map((scan: any) => ({
      plateNumber: scan.plate_number,
      recordedAt: scan.recorded_at,
      isCompliant: scan.is_compliant === 1,
      zoneName: scan.zone_name || 'Unknown Zone',
    }));

    return {
      scansToday,
      breachesActive,
      incidentsOpen: 0, // Incidents not yet in schema
      flaggedVehicles,
      totalObservations,
      totalPhotos,
      recentScans: recentScansFormatted,
    };
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    return getMockStats();
  }
}

/**
 * Get statistics for a specific date range
 */
export async function getStatsForDateRange(
  startDate: Date,
  endDate: Date
): Promise<{
  totalScans: number;
  compliantScans: number;
  breachScans: number;
  uniqueVehicles: number;
}> {
  if (Platform.OS === 'web') {
    return { totalScans: 0, compliantScans: 0, breachScans: 0, uniqueVehicles: 0 };
  }

  try {
    const db = getDatabase();
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const result = await db.getFirstAsync<any>(
      `SELECT 
        COUNT(*) as total_scans,
        SUM(CASE WHEN is_compliant = 1 THEN 1 ELSE 0 END) as compliant_scans,
        SUM(CASE WHEN is_compliant = 0 THEN 1 ELSE 0 END) as breach_scans,
        COUNT(DISTINCT plate_number) as unique_vehicles
      FROM observations
      WHERE recorded_at >= ? AND recorded_at <= ?`,
      [startISO, endISO]
    );

    return {
      totalScans: result?.total_scans || 0,
      compliantScans: result?.compliant_scans || 0,
      breachScans: result?.breach_scans || 0,
      uniqueVehicles: result?.unique_vehicles || 0,
    };
  } catch (error) {
    console.error('Error getting date range stats:', error);
    return { totalScans: 0, compliantScans: 0, breachScans: 0, uniqueVehicles: 0 };
  }
}

/**
 * Get top zones by scan count
 */
export async function getTopZonesByActivity(limit: number = 5): Promise<{
  zoneId: string;
  zoneName: string;
  scanCount: number;
  breachCount: number;
}[]> {
  if (Platform.OS === 'web') {
    return [];
  }

  try {
    const db = getDatabase();

    const zones = await db.getAllAsync<any>(
      `SELECT 
        z.id as zone_id,
        z.name as zone_name,
        COUNT(o.id) as scan_count,
        SUM(CASE WHEN o.is_compliant = 0 THEN 1 ELSE 0 END) as breach_count
      FROM zones z
      LEFT JOIN observations o ON z.id = o.zone_id
      WHERE z.is_active = 1
      GROUP BY z.id
      ORDER BY scan_count DESC
      LIMIT ?`,
      [limit]
    );

    return zones.map((zone: any) => ({
      zoneId: zone.zone_id,
      zoneName: zone.zone_name,
      scanCount: zone.scan_count || 0,
      breachCount: zone.breach_count || 0,
    }));
  } catch (error) {
    console.error('Error getting top zones:', error);
    return [];
  }
}

/**
 * Get all photos with metadata
 */
export async function getAllPhotos(): Promise<{
  localPath: string;
  plateNumber: string;
  capturedAt: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
}[]> {
  if (Platform.OS === 'web') {
    return [];
  }

  try {
    const db = getDatabase();

    const photos = await db.getAllAsync<any>(
      `SELECT 
        local_path,
        plate_number,
        captured_at,
        gps_latitude,
        gps_longitude
      FROM photos
      ORDER BY captured_at DESC`
    );

    return photos.map((photo: any) => ({
      localPath: photo.local_path,
      plateNumber: photo.plate_number,
      capturedAt: photo.captured_at,
      gpsLatitude: photo.gps_latitude,
      gpsLongitude: photo.gps_longitude,
    }));
  } catch (error) {
    console.error('Error getting all photos:', error);
    return [];
  }
}

/**
 * Delete a photo by local path
 */
export async function deletePhoto(localPath: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const db = getDatabase();
    await db.runAsync('DELETE FROM photos WHERE local_path = ?', [localPath]);
  } catch (error) {
    console.error('Error deleting photo:', error);
    throw error;
  }
}

/**
 * Get weekly activity summary
 */
export async function getWeeklySummary(): Promise<{
  date: string;
  scans: number;
  breaches: number;
}[]> {
  if (Platform.OS === 'web') {
    return [];
  }

  try {
    const db = getDatabase();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const summary = await db.getAllAsync<any>(
      `SELECT 
        DATE(recorded_at) as date,
        COUNT(*) as scans,
        SUM(CASE WHEN is_compliant = 0 THEN 1 ELSE 0 END) as breaches
      FROM observations
      WHERE recorded_at >= ?
      GROUP BY DATE(recorded_at)
      ORDER BY date ASC`,
      [sevenDaysAgoISO]
    );

    return summary.map((day: any) => ({
      date: day.date,
      scans: day.scans || 0,
      breaches: day.breaches || 0,
    }));
  } catch (error) {
    console.error('Error getting weekly summary:', error);
    return [];
  }
}

function getMockStats(): DashboardStats {
  return {
    scansToday: 0,
    breachesActive: 0,
    incidentsOpen: 0,
    flaggedVehicles: 0,
    totalObservations: 0,
    totalPhotos: 0,
    recentScans: [],
  };
}
