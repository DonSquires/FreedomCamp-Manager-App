import * as Location from 'expo-location';
import { getDatabase } from './database';

export interface GPSLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

/**
 * Request location permissions
 */
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Location permission error:', error);
    return false;
  }
}

/**
 * Get current GPS location
 */
export async function getCurrentLocation(): Promise<GPSLocation | null> {
  try {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      throw new Error('Location permission denied');
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy || 0,
      timestamp: location.timestamp,
    };
  } catch (error) {
    console.error('Error getting location:', error);
    return null;
  }
}

/**
 * Calculate distance between two GPS points in meters
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find nearest zone based on GPS location
 */
export async function findNearestZone(
  latitude: number,
  longitude: number
): Promise<{ zoneId: string; zoneName: string; distance: number } | null> {
  try {
    const db = getDatabase();
    
    // Get all zones with coordinates
    const zones = await db.getAllAsync<any>(
      `SELECT id, name, location_lat, location_lng FROM zones 
       WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL`
    );

    if (zones.length === 0) {
      return null;
    }

    // Find nearest zone
    let nearestZone = zones[0];
    let minDistance = calculateDistance(
      latitude,
      longitude,
      nearestZone.location_lat,
      nearestZone.location_lng
    );

    for (const zone of zones) {
      const distance = calculateDistance(
        latitude,
        longitude,
        zone.location_lat,
        zone.location_lng
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestZone = zone;
      }
    }

    // Only return if within 50m
    if (minDistance > 50) {
      return null;
    }

    return {
      zoneId: nearestZone.id,
      zoneName: nearestZone.name,
      distance: Math.round(minDistance),
    };
  } catch (error) {
    console.error('Error finding nearest zone:', error);
    return null;
  }
}

/**
 * Get all zones for manual selection
 */
export async function getAllZones(): Promise<Array<{ id: string; name: string }>> {
  try {
    const db = getDatabase();
    const zones = await db.getAllAsync<any>(
      'SELECT id, name FROM zones ORDER BY name ASC'
    );
    return zones;
  } catch (error) {
    console.error('Error getting zones:', error);
    return [];
  }
}
