# Data Flow Analysis: Mobile App ↔ Supabase ↔ Web Platform

## Overview
This document maps the complete data flow between the FreedomCamp Manager mobile app, Supabase backend, and web administration platform.

---

## 1. Mobile App → Supabase (Data Writes)

### 1.1 Authentication Flow
```
Login Screen → supabase.auth.signInWithPassword()
  ↓
user_profiles table (SELECT by user.id)
  ↓
Local Officer state in AuthContext
  ↓
Auto-start GPS tracking in GPSContext
```

**Tables Affected:**
- `auth.users` (Supabase Auth)
- `user_profiles` (read)

**Status:** ✅ Working

---

### 1.2 GPS Tracking & Welfare Pings
```
GPSContext (30-second interval)
  ↓
officer_activity_log table
  {
    user_id,
    organization_id,
    activity_type: 'gps_ping',
    gps_latitude,
    gps_longitude,
    gps_accuracy,
    metadata: { zone_id, movement_detected }
  }
```

**Auto-Sync:**
- Online: Direct INSERT to `officer_activity_log`
- Offline: Queue in AsyncStorage → sync when network restored

**Edge Function:** `monitor-officer-welfare` (checks for inactivity)

**Tables Affected:**
- `officer_activity_log` (insert)
- `officer_welfare_alerts` (created by Edge Function when inactivity detected)

**Status:** ✅ Working (background tracking + automatic pings)

---

### 1.3 Vehicle Observations (Plate Scans)
```
PlateScanner (camera) → ALPR API
  ↓
vehicleObservation.ts
  ↓
1. get_or_create_canonical_vehicle() RPC
   → canonical_vehicles table (INSERT/UPDATE)
  ↓
2. vehicle_observations table (INSERT)
   {
     vehicle_id (FK),
     zone_id (FK),
     organization_id,
     recorded_by,
     is_self_contained,
     gps_latitude,
     gps_longitude,
     evidence_photos (JSONB)
   }
  ↓
3. Edge Function: process-field-scan
   → Evaluates compliance
   → Creates compliance_results record
   → May create breach_alerts
```

**Tables Affected:**
- `canonical_vehicles` (upsert)
- `vehicle_observations` (insert)
- `compliance_results` (insert via Edge Function)
- `breach_alerts` (insert via Edge Function if breach detected)

**Offline Support:** ✅ Yes (queued with plate_number for later sync)

**Status:** ✅ Working

---

### 1.4 Incident Reports
```
incident-report.tsx
  ↓
incidentReporting.ts → createIncident()
  ↓
1. Generate incident_number (INC-YYYY-NNNNNN)
2. INSERT incidents table
3. Upload photos → photo_metadata table
4. UPDATE incidents.photo_metadata_ids
```

**Tables Affected:**
- `incidents` (insert)
- `photo_metadata` (insert for each photo)
- `incident_actions` (via trigger for audit trail)

**Offline Support:** ✅ Yes

**⚠️ ISSUE IDENTIFIED:** 
- Mobile app does NOT currently link incidents to vehicles/zones/persons
- `incident-report.tsx` missing VehicleSelector and ZoneSelector components
- Database supports `vehicle_id` and `zone_id` foreign keys but UI doesn't capture them

**Status:** ⚠️ Partial - needs linking UI

---

### 1.5 Health & Safety Reports
```
hs-report.tsx
  ↓
incidentReporting.ts → createHealthSafetyReport()
  ↓
1. Generate report_number (HS-YYYY-NNNNNN)
2. INSERT health_safety_reports table
3. Upload photos → photo_metadata table
```

**Tables Affected:**
- `health_safety_reports` (insert)
- `photo_metadata` (insert)

**Offline Support:** ✅ Yes

**⚠️ ISSUE IDENTIFIED:**
- Same as incidents - missing vehicle/zone/person linking

**Status:** ⚠️ Partial - needs linking UI

---

### 1.6 Patrol Check-in/Completion
```
PatrolCard component
  ↓
patrolService.ts
  ↓
UPDATE patrols table
  {
    status: 'in_progress' | 'completed',
    checked_in_at,
    check_in_location_lat,
    check_in_location_lng,
    completed_at,
    notes
  }
```

**Tables Affected:**
- `patrols` (update)

**Offline Support:** ❌ No (requires online connection)

**Status:** ✅ Working but no offline support

---

### 1.7 Photo Uploads
```
photoUpload.ts → uploadMultiplePhotos()
  ↓
1. Compress image (if > threshold)
2. Generate SHA256 hash
3. Upload to Supabase Storage (incident-evidence bucket)
4. INSERT photo_metadata
   {
     photo_url,
     photo_hash,
     photo_type,
     organization_id,
     user_id,
     incident_id / vehicle_record_id / observation_id,
     retention_policy,
     court_ready,
     scheduled_deletion_at
   }
```

**Storage Buckets:**
- `evidence` (public, used by mobile)
- `incident-evidence` (private, court-ready)

**Tables Affected:**
- `photo_metadata` (insert)

**Status:** ✅ Working (with SHA256 integrity verification)

---

## 2. Supabase → Mobile App (Data Reads)

### 2.1 User Profile Loading
```
AuthContext (on login)
  ↓
SELECT * FROM user_profiles WHERE id = auth.uid()
  ↓
Load officer data (name, role, organization_id, permissions)
```

**Status:** ✅ Working

---

### 2.2 Zone Detection
```
GPSContext → detectZone()
  ↓
RPC: find_nearest_zone(lat, lng, max_distance_km: 0.5)
  ↓
Returns nearest zone or null
```

**Tables Queried:**
- `zones` (via RPC function)

**Status:** ✅ Working

---

### 2.3 Vehicle Lookups
```
observe.tsx → lookupCanonicalVehicle()
  ↓
SELECT * FROM canonical_vehicles WHERE plate_number = ?
  ↓
Returns vehicle details or null
```

**Tables Queried:**
- `canonical_vehicles`

**Used for:**
- Auto-populating vehicle details
- Checking if vehicle is flagged
- Showing previous observation count

**Status:** ✅ Working

---

### 2.4 Breach Alerts
```
history.tsx (Breaches tab)
  ↓
SELECT * FROM breach_alerts
  WHERE organization_id = ?
  ORDER BY created_at DESC
```

**Tables Queried:**
- `breach_alerts`
- Joins: `zones`, `vehicle_records`, `user_profiles`

**Status:** ✅ Working

---

### 2.5 Flagged Vehicles
```
flagged-vehicles.tsx
  ↓
SELECT * FROM flagged_vehicles
  WHERE organization_id = ?
  AND is_active = true
```

**Tables Queried:**
- `flagged_vehicles`

**Also used in:**
- PlateScanner (real-time warning when flagged plate detected)

**Status:** ✅ Working

---

### 2.6 Investigation Jobs
```
investigation-jobs.tsx
  ↓
SELECT * FROM investigation_jobs
  WHERE assigned_to = officer.id
  OR created_by = officer.id
```

**Tables Queried:**
- `investigation_jobs`
- Joins: `zones`, `canonical_vehicles`, `user_profiles`

**Status:** ✅ Working

---

### 2.7 Push Notifications
```
NotificationContext
  ↓
1. Request Expo push token
2. Save to user_profiles.push_token
  ↓
Edge Functions send notifications:
  - scan-breaches → new breach alerts
  - monitor-officer-welfare → officer inactivity
  - (custom) → flagged vehicle detected
```

**⚠️ ISSUE IDENTIFIED:**
- Push notification infrastructure exists but NOT fully integrated
- No Edge Function triggers for:
  - Flagged vehicle detection
  - Investigation job assignments
  - Breach alerts
- `user_profiles` table does NOT have `push_token` column

**Status:** ⚠️ Partial - infrastructure only, needs implementation

---

## 3. Web Platform → Supabase (Admin Operations)

Based on FEATURE_COMPARISON.md and database schema:

### 3.1 Web-Only Features (Not in Mobile)
```
✅ User Management
   → user_profiles (CRUD)
   → organization assignment

✅ Organization Management
   → organizations (CRUD)

✅ Zone Management
   → zones (CRUD)
   → zone_compliance_matrix (versioning)

✅ Analytics & Reports
   → Compliance statistics
   → Leadership packs (PDF generation)
   → Audit logs

✅ Compliance Policy Management
   → zone_compliance_matrix (create versions)
   → drift_events (track policy changes)
   → recalculate-all-compliance Edge Function

✅ Investigation Job Assignment
   → investigation_jobs (create/assign)

✅ Flagged Vehicle Management
   → flagged_vehicles (CRUD)
```

**Status:** ✅ Web platform has full admin capabilities

---

## 4. Identified Issues & Gaps

### 🔴 Critical Issues

#### 4.1 Missing Vehicle/Zone/Person Linking in Reports
**Problem:**
- `incident-report.tsx` and `hs-report.tsx` don't use VehicleSelector/ZoneSelector
- Database schema supports linking but UI doesn't capture it
- Incidents/H&S reports can't be linked to specific vehicles, zones, or persons

**Impact:** Data isolation - can't track which incidents relate to which vehicles

**Solution Required:**
1. Add VehicleSelector to incident/H&S forms
2. Add ZoneSelector (with auto-detected zone override)
3. Add person linking (optional text input)
4. Update submission logic to include foreign keys

---

#### 4.2 Push Notifications Not Fully Implemented
**Problem:**
- NotificationContext registers tokens but no backend triggers
- `user_profiles` table missing `push_token` column
- No Edge Function integration for:
  - Flagged vehicle alerts
  - Breach notifications
  - Investigation assignments

**Impact:** Officers miss critical real-time alerts

**Solution Required:**
1. Add `push_token` column to `user_profiles`
2. Create Edge Function triggers:
   - After breach_alerts INSERT → send push notification
   - After flagged vehicle detected in scan → send push notification
   - After investigation_jobs assignment → send push notification
3. Update existing Edge Functions to call notification service

---

#### 4.3 Offline Queue for Patrols
**Problem:**
- Patrol check-in/completion requires online connection
- No offline queue support

**Impact:** Officers in poor coverage areas can't check in/out

**Solution Required:**
- Add patrol operations to offline queue
- Handle UPDATE operations (currently only INSERT)

---

### 🟡 Medium Priority Issues

#### 4.4 Incomplete Activity Monitoring
**Current:**
- Dashboard and Observe screens reset inactivity timer
- Other screens (history, profile, modals) don't

**Solution:**
- Add `useActivityMonitor()` to all screens
- Wrap all scrollable areas with touch handlers

---

#### 4.5 No Real-time Breach Alerts
**Current:**
- Mobile app only shows breach history
- No real-time subscription to `breach_alerts` table

**Solution:**
- Add Supabase real-time subscription in history.tsx
- Show toast/notification when new breach detected
- Play alert sound for critical breaches

---

## 5. Data Flow Validation Checklist

### ✅ Working Correctly
- [x] Authentication flow
- [x] GPS tracking (30-second welfare pings)
- [x] Vehicle observation creation
- [x] Canonical vehicle management
- [x] Zone detection
- [x] Photo uploads with SHA256 hashing
- [x] Offline queue for observations/incidents/H&S
- [x] Flagged vehicle warnings
- [x] Investigation job viewing
- [x] Patrol check-in/completion (online only)

### ⚠️ Partially Working
- [ ] Incident reporting (no vehicle/zone linking)
- [ ] H&S reporting (no vehicle/zone linking)
- [ ] Push notifications (infrastructure only)
- [ ] Activity monitoring (only on 2/4 main screens)

### ❌ Missing Features
- [ ] Real-time breach alerts subscription
- [ ] Push notification triggers from backend
- [ ] Offline patrol operations
- [ ] Incident-to-vehicle linking UI
- [ ] Person records linking

---

## 6. Recommended Fixes (Priority Order)

### Priority 1: Critical Data Linking
1. **Add VehicleSelector and ZoneSelector to incident/H&S reports**
   - Update `incident-report.tsx` to include vehicle/zone selection
   - Update `hs-report.tsx` to include vehicle/zone selection
   - Update submission payloads to include `vehicle_id` and `zone_id`

### Priority 2: Push Notifications
2. **Add push_token column to user_profiles**
   ```sql
   ALTER TABLE user_profiles 
   ADD COLUMN push_token text,
   ADD COLUMN push_token_updated_at timestamp with time zone;
   ```

3. **Create notification service Edge Function**
   - Shared function to send Expo push notifications
   - Called by other Edge Functions

4. **Add triggers for breach/flagged vehicle/investigation alerts**

### Priority 3: Real-time Features
5. **Add real-time breach alerts subscription**
   - Subscribe to `breach_alerts` table in history.tsx
   - Show toast notifications for new breaches

### Priority 4: Offline Improvements
6. **Add patrol offline queue support**
   - Support UPDATE operations in offline queue
   - Queue patrol check-in/completion when offline

---

## 7. Database Triggers & Edge Functions

### Current Edge Functions in Use
- ✅ `process-field-scan` - Compliance evaluation for observations
- ✅ `monitor-officer-welfare` - Checks GPS ping inactivity
- ⚠️ `scan-breaches` - Breach detection (triggered by web, not mobile)
- ❌ `send-push-notification` - **Does not exist, needs creation**

### Database Triggers
- ✅ `on_auth_user_created` - Auto-creates user_profile
- ✅ `trigger_increment_observations` - Updates canonical_vehicles.total_observations
- ✅ `trigger_log_vehicle_changes` - Audit trail for vehicle records
- ✅ `trigger_set_enforcement_flag` - Auto-flags incidents requiring enforcement
- ✅ `trigger_set_scheduled_deletion` - Photo retention policy enforcement

---

## Conclusion

The mobile app has **strong core data flow** for vehicle observations, GPS tracking, and offline capabilities. However, there are **critical gaps** in:

1. **Linking incidents/H&S reports to vehicles and zones** (database supports it, UI doesn't)
2. **Push notifications** (infrastructure exists but not wired to backend triggers)
3. **Real-time updates** (no subscriptions for breach alerts)

These gaps prevent the mobile app from being a fully integrated part of the compliance enforcement workflow. The recommended fixes above will close these gaps and enable proper data flow between mobile → Supabase → web platform.
