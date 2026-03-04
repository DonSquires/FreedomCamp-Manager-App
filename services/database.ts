import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

// Database instance
let db: SQLite.SQLiteDatabase | null = null;

// Mock database for web preview (not used in production APK)
const mockDb = {
  execAsync: async () => {},
  runAsync: async () => {},
  getFirstAsync: async () => null,
};

/**
 * Initialize SQLite database and create tables
 */
export async function initDatabase(): Promise<void> {
  try {
    // Only use SQLite on native platforms (iOS/Android)
    if (Platform.OS === 'web') {
      console.log('⚠️ Web platform detected - using mock database (APK only)');
      return;
    }
    
    db = await SQLite.openDatabaseAsync('freedomcamp.db');
    
    console.log('📦 Initializing database...');
    
    // Sync Metadata
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      );
    `);
    
    // Zones
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS zones (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        name TEXT,
        self_contained_required INTEGER,
        nights_per_month INTEGER,
        max_consecutive_nights INTEGER,
        day_visit_only INTEGER,
        allowed_days TEXT,
        homeless_exemption INTEGER,
        location_lat REAL,
        location_lng REAL,
        last_updated INTEGER
      );
    `);
    
    // Compliance Matrix
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS compliance_matrix (
        id TEXT PRIMARY KEY,
        zone_id TEXT,
        version INTEGER,
        effective_from INTEGER,
        effective_to INTEGER,
        self_contained_required INTEGER,
        nights_per_month INTEGER,
        max_consecutive_nights INTEGER,
        day_visit_only INTEGER,
        allowed_days TEXT,
        homeless_exemption INTEGER
      );
    `);
    
    // Flagged Vehicles
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS flagged_vehicles (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        plate_number TEXT,
        priority TEXT,
        reason TEXT,
        notes TEXT,
        flagged_at INTEGER,
        is_active INTEGER
      );
    `);
    
    // Canonical Vehicles (Cached)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS canonical_vehicles (
        plate_number TEXT PRIMARY KEY,
        vehicle_make TEXT,
        vehicle_model TEXT,
        vehicle_year INTEGER,
        vehicle_color TEXT,
        self_contained INTEGER,
        self_contained_expiry INTEGER,
        homeless_status TEXT,
        is_flagged INTEGER,
        flagged_reason TEXT,
        last_seen_at INTEGER,
        total_observations INTEGER
      );
    `);
    
    // Vehicle Monthly Stays (Cached)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS vehicle_monthly_stays (
        id TEXT PRIMARY KEY,
        plate_number TEXT,
        zone_id TEXT,
        calendar_month INTEGER,
        nights_stayed INTEGER,
        consecutive_nights INTEGER,
        last_observation_date INTEGER
      );
    `);
    
    // Recent Observations (Last 7 Days)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS recent_observations (
        observation_id TEXT PRIMARY KEY,
        plate_number TEXT,
        zone_id TEXT,
        recorded_at INTEGER,
        recorded_by TEXT,
        self_contained INTEGER,
        is_compliant INTEGER,
        gps_latitude REAL,
        gps_longitude REAL
      );
    `);
    
    // Upload Queue
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS upload_queue (
        id TEXT PRIMARY KEY,
        action_type TEXT,
        payload TEXT,
        created_at INTEGER,
        upload_attempts INTEGER DEFAULT 0,
        uploaded INTEGER DEFAULT 0,
        server_id TEXT
      );
    `);
    
    // Local Photos
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS local_photos (
        id TEXT PRIMARY KEY,
        local_path TEXT,
        plate_number TEXT,
        observation_id TEXT,
        incident_id TEXT,
        captured_at INTEGER,
        gps_latitude REAL,
        gps_longitude REAL,
        uploaded INTEGER DEFAULT 0,
        server_url TEXT
      );
    `);
    
    // Local Incidents
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS local_incidents (
        id TEXT PRIMARY KEY,
        plate_number TEXT,
        zone_id TEXT,
        incident_type TEXT,
        description TEXT,
        severity TEXT,
        happened_at INTEGER,
        gps_latitude REAL,
        gps_longitude REAL,
        photo_ids TEXT,
        officer_notes TEXT,
        created_at INTEGER,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Investigation Jobs
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS investigation_jobs (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        reference_number TEXT,
        job_type TEXT,
        location_address TEXT,
        gps_latitude REAL,
        gps_longitude REAL,
        briefing_notes TEXT,
        instructions TEXT,
        client_name TEXT,
        assigned_to TEXT,
        status TEXT,
        priority TEXT,
        due_date INTEGER,
        created_at INTEGER,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Enforcement Actions
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS enforcement_actions (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        plate_number TEXT,
        zone_id TEXT,
        action_type TEXT,
        delivery_method TEXT,
        recipient_name TEXT,
        recipient_email TEXT,
        recipient_phone TEXT,
        gps_latitude REAL,
        gps_longitude REAL,
        notes TEXT,
        status TEXT,
        recorded_at INTEGER,
        created_at INTEGER,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Patrols
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS patrols (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        zone_id TEXT,
        patrol_date INTEGER,
        shift TEXT,
        assigned_to TEXT,
        status TEXT,
        checked_in_at INTEGER,
        completed_at INTEGER,
        notes TEXT,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Officer Activity Log
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS officer_activity_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        organization_id TEXT,
        activity_type TEXT,
        gps_latitude REAL,
        gps_longitude REAL,
        gps_accuracy REAL,
        recorded_at INTEGER,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Investigation Findings
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS investigation_findings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        visit_date INTEGER,
        arrived_at TEXT,
        departed_at TEXT,
        findings_summary TEXT,
        structures_found TEXT,
        vehicles_found TEXT,
        persons_contacted TEXT,
        evidence_photos TEXT,
        recommendations TEXT,
        follow_up_required INTEGER,
        officer_notes TEXT,
        completed_by TEXT,
        completed_at INTEGER,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Zone Creation Suggestions (officer-initiated zones)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS zone_creation_suggestions (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        suggested_name TEXT NOT NULL,
        suggested_description TEXT,
        center_lat REAL NOT NULL,
        center_lng REAL NOT NULL,
        location_type TEXT DEFAULT 'point',
        status TEXT DEFAULT 'pending',
        created_by TEXT,
        created_at INTEGER,
        synced INTEGER DEFAULT 0
      );
    `);
    
    // Messages
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT,
        sender_name TEXT,
        sender_role TEXT,
        recipient_id TEXT,
        message TEXT,
        timestamp INTEGER,
        read INTEGER DEFAULT 0,
        synced INTEGER DEFAULT 0
      );
    `);
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

/**
 * Get database instance
 */
export function getDatabase(): any {
  if (Platform.OS === 'web') {
    return mockDb as any;
  }
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Clear all data (for logout)
 */
export async function clearDatabase(): Promise<void> {
  const database = getDatabase();
  
  await database.execAsync(`
    DELETE FROM sync_metadata;
    DELETE FROM zones;
    DELETE FROM compliance_matrix;
    DELETE FROM flagged_vehicles;
    DELETE FROM canonical_vehicles;
    DELETE FROM vehicle_monthly_stays;
    DELETE FROM recent_observations;
    DELETE FROM upload_queue;
    DELETE FROM local_photos;
    DELETE FROM local_incidents;
    DELETE FROM investigation_jobs;
    DELETE FROM enforcement_actions;
    DELETE FROM patrols;
    DELETE FROM officer_activity_log;
    DELETE FROM investigation_findings;
    DELETE FROM zone_creation_suggestions;
    DELETE FROM messages;
  `);
  
  console.log('🗑️ Database cleared');
}

/**
 * Set sync metadata
 */
export async function setSyncMetadata(key: string, value: string): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)',
    key,
    value,
    Date.now()
  );
}

/**
 * Get sync metadata
 */
export async function getSyncMetadata(key: string): Promise<string | null> {
  const database = getDatabase();
  const result = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    key
  );
  return result?.value || null;
}
