import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getDatabase } from './database';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_TASK_NAME = 'background-location-task';
const GPS_PING_INTERVAL = 30000; // 30 seconds

export interface TrackingSettings {
  enabled: boolean;
  pingInterval: number; // seconds
  activityType: 'patrol' | 'investigation' | 'idle';
}

let trackingInterval: NodeJS.Timeout | null = null;
let lastActivityTimestamp = Date.now();

/**
 * Request location permissions
 */
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (foregroundStatus !== 'granted') {
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    
    return backgroundStatus === 'granted';
  } catch (error) {
    console.error('Location permission error:', error);
    return false;
  }
}

/**
 * Start GPS tracking
 */
export async function startTracking(activityType: 'patrol' | 'investigation' | 'idle' = 'patrol'): Promise<void> {
  try {
    const hasPermission = await requestLocationPermissions();
    
    if (!hasPermission) {
      throw new Error('Location permissions not granted');
    }

    // Store tracking state
    await AsyncStorage.setItem('tracking_active', 'true');
    await AsyncStorage.setItem('tracking_activity_type', activityType);
    
    // Update last activity
    lastActivityTimestamp = Date.now();
    await AsyncStorage.setItem('last_activity_timestamp', lastActivityTimestamp.toString());

    // Start interval-based tracking (more reliable than background task)
    if (trackingInterval) {
      clearInterval(trackingInterval);
    }

    trackingInterval = setInterval(async () => {
      await sendGPSPing(activityType);
    }, GPS_PING_INTERVAL);

    // Send initial ping
    await sendGPSPing(activityType);

    console.log('📍 GPS tracking started');
  } catch (error) {
    console.error('Start tracking error:', error);
    throw error;
  }
}

/**
 * Stop GPS tracking
 */
export async function stopTracking(): Promise<void> {
  try {
    if (trackingInterval) {
      clearInterval(trackingInterval);
      trackingInterval = null;
    }

    await AsyncStorage.setItem('tracking_active', 'false');
    
    console.log('📍 GPS tracking stopped');
  } catch (error) {
    console.error('Stop tracking error:', error);
  }
}

/**
 * Send GPS ping to backend
 */
async function sendGPSPing(activityType: string): Promise<void> {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const profileStr = await AsyncStorage.getItem('user_profile');
    if (!profileStr) return;

    const profile = JSON.parse(profileStr);

    const pingData = {
      user_id: profile.id,
      organization_id: profile.organization_id,
      activity_type: activityType,
      gps_latitude: location.coords.latitude,
      gps_longitude: location.coords.longitude,
      gps_accuracy: location.coords.accuracy,
      recorded_at: new Date().toISOString(),
    };

    // Store locally first
    const db = getDatabase();
    await db.runAsync(
      `INSERT INTO officer_activity_log (id, user_id, organization_id, activity_type, 
       gps_latitude, gps_longitude, gps_accuracy, recorded_at, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Date.now().toString(),
      pingData.user_id,
      pingData.organization_id,
      pingData.activity_type,
      pingData.gps_latitude,
      pingData.gps_longitude,
      pingData.gps_accuracy,
      Date.now(),
      0
    );

    // Try to sync to backend
    try {
      const { error } = await supabase
        .from('officer_activity_log')
        .insert([pingData]);

      if (!error) {
        // Mark as synced
        await db.runAsync(
          'UPDATE officer_activity_log SET synced = 1 WHERE id = ?',
          Date.now().toString()
        );
      }
    } catch (syncError) {
      // Offline - will sync later
      console.log('GPS ping queued for sync');
    }

    // Update last activity timestamp
    lastActivityTimestamp = Date.now();
    await AsyncStorage.setItem('last_activity_timestamp', lastActivityTimestamp.toString());

  } catch (error) {
    console.error('GPS ping error:', error);
  }
}

/**
 * Get current location
 */
export async function getCurrentLocation(): Promise<Location.LocationObject | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return location;
  } catch (error) {
    console.error('Get location error:', error);
    return null;
  }
}

/**
 * Check if tracking is active
 */
export async function isTrackingActive(): Promise<boolean> {
  const active = await AsyncStorage.getItem('tracking_active');
  return active === 'true';
}

/**
 * Get last activity timestamp
 */
export async function getLastActivityTime(): Promise<number> {
  const timestamp = await AsyncStorage.getItem('last_activity_timestamp');
  return timestamp ? parseInt(timestamp) : Date.now();
}

/**
 * Update activity (call this on user interactions)
 */
export async function updateActivity(): Promise<void> {
  lastActivityTimestamp = Date.now();
  await AsyncStorage.setItem('last_activity_timestamp', lastActivityTimestamp.toString());
}
