import { getDatabase } from './database';
import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import * as NetInfo from '@react-native-community/netinfo';

export type QueueActionType = 
  | 'observation' 
  | 'observation_update' 
  | 'observation_delete' 
  | 'incident' 
  | 'photo' 
  | 'note';

export interface QueueItem {
  id: string;
  action_type: QueueActionType;
  payload: any;
  created_at: number;
  upload_attempts: number;
  uploaded: boolean;
  server_id: string | null;
}

/**
 * Add item to upload queue
 */
export async function addToUploadQueue(
  actionType: QueueActionType,
  payload: any
): Promise<string> {
  const db = getDatabase();
  
  const id = `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await db.runAsync(
    `INSERT INTO upload_queue (id, action_type, payload, created_at, upload_attempts, uploaded) 
     VALUES (?, ?, ?, ?, 0, 0)`,
    id,
    actionType,
    JSON.stringify(payload),
    Date.now()
  );
  
  console.log(`✓ Added to upload queue: ${actionType} (${id})`);
  
  return id;
}

/**
 * Get pending upload queue items
 */
export async function getPendingQueueItems(limit: number = 50): Promise<QueueItem[]> {
  const db = getDatabase();
  
  const items = await db.getAllAsync<any>(
    `SELECT * FROM upload_queue 
     WHERE uploaded = 0 AND upload_attempts < 5
     ORDER BY created_at ASC LIMIT ?`,
    limit
  );
  
  return items.map((item) => ({
    id: item.id,
    action_type: item.action_type,
    payload: JSON.parse(item.payload),
    created_at: item.created_at,
    upload_attempts: item.upload_attempts,
    uploaded: item.uploaded === 1,
    server_id: item.server_id,
  }));
}

/**
 * Process upload queue (background sync)
 */
export async function processUploadQueue(): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  // Check network connectivity
  const netInfo = await NetInfo.fetch();
  if (!netInfo.isConnected) {
    console.log('⚠️ No network connection - skipping queue processing');
    return { processed: 0, successful: 0, failed: 0 };
  }
  
  const db = getDatabase();
  const items = await getPendingQueueItems(50);
  
  if (items.length === 0) {
    console.log('✓ Upload queue is empty');
    return { processed: 0, successful: 0, failed: 0 };
  }
  
  console.log(`📤 Processing ${items.length} queued items...`);
  
  let successful = 0;
  let failed = 0;
  
  for (const item of items) {
    try {
      let serverId: string | null = null;
      
      switch (item.action_type) {
        case 'observation':
          serverId = await uploadObservation(item.payload);
          break;
        case 'observation_update':
          serverId = await uploadObservationUpdate(item.payload);
          break;
        case 'observation_delete':
          serverId = await uploadObservationDelete(item.payload);
          break;
        case 'incident':
          serverId = await uploadIncident(item.payload);
          break;
        case 'photo':
          serverId = await uploadPhoto(item.payload);
          break;
        case 'note':
          serverId = await uploadNote(item.payload);
          break;
      }
      
      // Mark as uploaded
      await db.runAsync(
        `UPDATE upload_queue SET uploaded = 1, server_id = ? WHERE id = ?`,
        serverId,
        item.id
      );
      
      successful++;
      console.log(`✓ Uploaded ${item.action_type} (${item.id})`);
      
    } catch (error: any) {
      console.error(`❌ Failed to upload ${item.action_type} (${item.id}):`, error.message);
      
      // Increment attempt counter
      await db.runAsync(
        `UPDATE upload_queue SET upload_attempts = upload_attempts + 1 WHERE id = ?`,
        item.id
      );
      
      failed++;
      
      // Remove from queue after 5 failed attempts
      if (item.upload_attempts >= 4) {
        console.error(`🗑️ Removing ${item.id} from queue after 5 failed attempts`);
        await db.runAsync(`DELETE FROM upload_queue WHERE id = ?`, item.id);
      }
    }
  }
  
  console.log(`✅ Queue processing complete: ${successful} successful, ${failed} failed`);
  
  return {
    processed: items.length,
    successful,
    failed,
  };
}

/**
 * Upload observation to server
 */
async function uploadObservation(payload: any): Promise<string> {
  const { data, error } = await supabase
    .from('vehicle_observations_v2')
    .insert(payload)
    .select('observation_id')
    .single();
  
  if (error) throw error;
  
  return data.observation_id;
}

/**
 * Upload observation update to server
 */
async function uploadObservationUpdate(payload: any): Promise<string> {
  const { observation_id, ...updates } = payload;
  
  const { error } = await supabase
    .from('vehicle_observations_v2')
    .update(updates)
    .eq('observation_id', observation_id);
  
  if (error) throw error;
  
  return observation_id;
}

/**
 * Upload observation deletion to server
 */
async function uploadObservationDelete(payload: any): Promise<string> {
  const { observation_id } = payload;
  
  const { error } = await supabase
    .from('vehicle_observations_v2')
    .delete()
    .eq('observation_id', observation_id);
  
  if (error) throw error;
  
  return observation_id;
}

/**
 * Upload incident to server
 */
async function uploadIncident(payload: any): Promise<string> {
  const { data, error } = await supabase
    .from('incidents')
    .insert(payload)
    .select('id')
    .single();
  
  if (error) throw error;
  
  return data.id;
}

/**
 * Upload photo to server
 */
async function uploadPhoto(payload: {
  local_path: string;
  plate_number: string;
  observation_id?: string;
  incident_id?: string;
  captured_at: number;
  gps_latitude?: number;
  gps_longitude?: number;
}): Promise<string> {
  // Read file as base64
  const base64 = await FileSystem.readAsStringAsync(payload.local_path, {
    encoding: FileSystem.EncodingType.Base64,
  });
  
  // Convert to blob
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'image/jpeg' });
  
  // Upload to Supabase Storage
  const fileName = `${payload.plate_number}_${Date.now()}.jpg`;
  const storagePath = `observations/${fileName}`;
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('incident-evidence')
    .upload(storagePath, blob, { contentType: 'image/jpeg' });
  
  if (uploadError) throw uploadError;
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from('incident-evidence')
    .getPublicUrl(storagePath);
  
  // Update local_photos table with server URL
  const db = getDatabase();
  await db.runAsync(
    `UPDATE local_photos SET uploaded = 1, server_url = ? WHERE local_path = ?`,
    urlData.publicUrl,
    payload.local_path
  );
  
  return uploadData.path;
}

/**
 * Upload note to server
 */
async function uploadNote(payload: any): Promise<string> {
  // Implement based on your notes table structure
  return 'note_' + Date.now();
}

/**
 * Get upload queue stats
 */
export async function getQueueStats(): Promise<{
  total: number;
  pending: number;
  failed: number;
}> {
  const db = getDatabase();
  
  const total = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM upload_queue WHERE uploaded = 0`
  );
  
  const failed = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM upload_queue WHERE uploaded = 0 AND upload_attempts >= 3`
  );
  
  return {
    total: total?.count || 0,
    pending: (total?.count || 0) - (failed?.count || 0),
    failed: failed?.count || 0,
  };
}

/**
 * Clear uploaded items from queue
 */
export async function clearUploadedItems(): Promise<void> {
  const db = getDatabase();
  
  await db.runAsync(`DELETE FROM upload_queue WHERE uploaded = 1`);
  
  console.log('🗑️ Cleared uploaded items from queue');
}
