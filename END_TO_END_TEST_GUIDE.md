# End-to-End Testing Guide - Post Schema Migration
**Date**: February 3, 2025  
**Purpose**: Complete workflow verification after vehicle_observations_v2 migration

---

## ✅ Schema Migration Status

**COMPLETED:**
- ✅ Database migrated to `vehicle_observations_v2` table
- ✅ Canonical vehicles uses `plate_number` as PRIMARY KEY
- ✅ All service files updated (vehicleObservation.ts, historicalDataSync.ts, vehicleRecords.ts)
- ✅ All screens updated (observe.tsx, shift-records.tsx)
- ✅ All components updated (RecentActivityList, SessionStatsCard, ObservationReviewModal)
- ✅ Officer notes tracking added (officer_notes, has_notes, notes_reference_previous)
- ✅ Breach detection fields added (breach_warning, breach_type, breach_details)
- ✅ Homeless status enum parsing ('none' | 'claimed' | 'confirmed')
- ✅ Single photo URL instead of JSON array
- ✅ NZSCV integration for self-contained verification

---

## 🔧 Testing Workflow

### **Test 1: Manual Plate Lookup**
**Purpose**: Verify that manual entry populates vehicle details from database

**Steps:**
1. Open **Observe** tab
2. Manually type license plate: `NYR607` (or any plate with 17+ observations)
3. Wait for auto-lookup (triggers at 3+ characters)

**Expected Results:**
- ✅ Message shows: "Vehicle exists in database (17 previous observations)"
- ✅ Vehicle make/model/color fields auto-populate from database
- ✅ If database fields empty, should populate from most recent observation
- ✅ Self-contained status checkbox auto-fills if certified
- ✅ Profile photo displays if available
- ✅ Flagged vehicle alert shown if vehicle is flagged

**Verification Query:**
```sql
-- Check what data exists for NYR607
SELECT 
  plate_number,
  vehicle_make,
  vehicle_model,
  vehicle_color,
  vehicle_year,
  self_contained,
  self_contained_expiry,
  is_flagged,
  flagged_priority,
  flagged_reason,
  total_observations
FROM canonical_vehicles
WHERE plate_number = 'NYR607';

-- Check most recent observation if canonical vehicle has empty fields
SELECT 
  vehicle_make,
  vehicle_model,
  vehicle_color,
  vehicle_year,
  recorded_at
FROM vehicle_observations_v2
WHERE plate_number = 'NYR607'
  AND vehicle_make IS NOT NULL
ORDER BY recorded_at DESC
LIMIT 1;
```

---

### **Test 2: Camera Scan + OnSpace AI Analysis**
**Purpose**: End-to-end vehicle observation workflow with AI detection

**Steps:**
1. Tap **"New Observation"** button on Dashboard
2. **Manual Button Screen** displays → Tap **"Scan Vehicle"**
3. Native camera opens → Take photo of vehicle
4. **EnhancedScanResultModal** shows AI analysis results:
   - Plate number detected
   - Vehicle make/model/color/year
   - Self-contained status (sticker detection)
5. Review results → Tap **"Save"**
6. Form auto-populates with AI-detected data
7. Add optional notes
8. Tap **"Record Observation"**
9. **ObservationReviewModal** appears with:
   - Vehicle summary
   - NZSCV status check (automatic registry lookup)
   - Compliance evaluation
   - Quick actions (incident, H&S, homeless claim, etc.)

**Expected Results:**
- ✅ Observation saved to `vehicle_observations_v2` table
- ✅ Canonical vehicle record created/updated with AI-detected data
- ✅ NZSCV registry checked automatically (async, non-blocking)
- ✅ ObservationReviewModal displays all information
- ✅ Officer can add incidents/H&S reports/homeless claims from modal

**Verification Query:**
```sql
-- Check latest observation was created
SELECT 
  observation_id,
  plate_number,
  vehicle_make,
  vehicle_model,
  vehicle_color,
  vehicle_year,
  self_contained,
  photo,
  officer_notes,
  has_notes,
  is_compliant,
  recorded_at,
  organization_id,
  zone_id,
  recorded_by
FROM vehicle_observations_v2
ORDER BY recorded_at DESC
LIMIT 1;

-- Verify canonical vehicle was updated with AI data
SELECT 
  plate_number,
  vehicle_make,
  vehicle_model,
  vehicle_color,
  vehicle_year,
  self_contained,
  self_contained_expiry,
  updated_at
FROM canonical_vehicles
WHERE plate_number = '<SCANNED_PLATE>'
ORDER BY updated_at DESC
LIMIT 1;

-- Check NZSCV status was updated
SELECT 
  plate_number,
  self_contained,
  self_contained_expiry,
  -- TODO: Add these columns to schema
  -- nzscv_last_checked,
  -- nzscv_source
FROM canonical_vehicles
WHERE plate_number = '<SCANNED_PLATE>';
```

---

### **Test 3: Historical Data Sync**
**Purpose**: Verify 3-day observation history downloads on login

**Steps:**
1. **Logout** from app (Profile → Logout)
2. **Login** again
3. Check console logs for historical data sync

**Expected Console Output:**
```
📥 Downloading 3 days of historical data for org: <org_id>
✅ Fetched XX observations
✅ Fetched XX vehicles
✅ Historical data saved: XX vehicles, XX observations
```

**Verification:**
```sql
-- Check what data should be downloaded for officer's organization
SELECT 
  COUNT(DISTINCT plate_number) as vehicle_count,
  COUNT(*) as observation_count
FROM vehicle_observations_v2
WHERE organization_id = '<OFFICER_ORG_ID>'
  AND recorded_at >= NOW() - INTERVAL '3 days'
ORDER BY recorded_at DESC;
```

**Test AsyncStorage Cache:**
- After login, enter a plate number that was observed in last 3 days
- App should show: "Vehicle exists in database (X previous observations)"
- Decision helper should provide recommendations based on historical data

---

### **Test 4: Shift Records Display**
**Purpose**: Verify shift records screen shows observations correctly

**Steps:**
1. Navigate to **Dashboard**
2. Tap **"View Recent History"** button
3. **Shift Records** screen opens

**Expected Results:**
- ✅ Shows all observations from current shift
- ✅ Displays plate number, vehicle details, zone, compliance status
- ✅ Own records highlighted with "YOU" badge
- ✅ Can delete own records within 24 hours
- ✅ Records older than 24 hours show "🔒 Locked (24h passed)"

**Verification Query:**
```sql
-- Check shift records for officer
SELECT 
  observation_id,
  plate_number,
  vehicle_make,
  vehicle_model,
  vehicle_color,
  recorded_at,
  recorded_by,
  zone_id,
  is_compliant,
  EXTRACT(EPOCH FROM (NOW() - recorded_at)) / 3600 as hours_ago
FROM vehicle_observations_v2
WHERE recorded_at >= CURRENT_DATE -- Today's shift
ORDER BY recorded_at DESC;
```

---

### **Test 5: Recent Activity Widget**
**Purpose**: Dashboard widget shows last 5 observations

**Steps:**
1. Go to **Dashboard**
2. Scroll to **"Recent Activity"** section

**Expected Results:**
- ✅ Shows last 5 observations by current officer
- ✅ Displays plate number, compliance status icon, time ago
- ✅ Green check = compliant, Yellow warning = non-compliant
- ✅ Shows "Just now", "Xm ago", "Xh ago" timestamps

**Verification Query:**
```sql
-- Recent activity for officer
SELECT 
  observation_id,
  plate_number,
  recorded_at,
  is_compliant,
  EXTRACT(EPOCH FROM (NOW() - recorded_at)) / 60 as minutes_ago
FROM vehicle_observations_v2
WHERE recorded_by = '<OFFICER_ID>'
ORDER BY recorded_at DESC
LIMIT 5;
```

---

### **Test 6: Officer Notes & Breach Tracking**
**Purpose**: New schema features working correctly

**Steps:**
1. Create observation with officer notes
2. Check database for notes tracking
3. Verify breach detection flags

**Expected Results:**
- ✅ `officer_notes` column populated
- ✅ `has_notes` flag set to `true`
- ✅ Breach detection triggers (if non-compliant)
- ✅ `breach_warning`, `breach_type`, `breach_details` populated

**Verification Query:**
```sql
-- Check officer notes and breach tracking
SELECT 
  observation_id,
  plate_number,
  officer_notes,
  has_notes,
  notes_reference_previous,
  breach_warning,
  breach_type,
  breach_details,
  is_compliant,
  recorded_at
FROM vehicle_observations_v2
WHERE has_notes = true
   OR breach_warning = true
ORDER BY recorded_at DESC
LIMIT 10;
```

---

### **Test 7: NZSCV Integration**
**Purpose**: Self-contained certification automatic checking

**Steps:**
1. Record observation for vehicle
2. ObservationReviewModal appears
3. Check **"Self-Contained Certification"** section

**Expected Results:**
- ✅ Shows "Checking NZSCV registry..." spinner
- ✅ NZSCV status badge appears:
  - Green = Certified (valid)
  - Yellow = Expiring soon (<30 days)
  - Red = Expired or not certified
- ✅ "Check NZSCV Registry" link opens website
- ✅ "Update Status" button allows manual override

**Manual Verification:**
1. Tap "Check NZSCV Registry"
2. Website opens with plate number pre-filled
3. Compare website result with app display
4. If different, tap "Update Status" to correct

**Verification Query:**
```sql
-- Check NZSCV status updates
SELECT 
  plate_number,
  self_contained,
  self_contained_expiry,
  updated_at,
  -- TODO: Add these columns
  -- nzscv_last_checked,
  -- nzscv_source
FROM canonical_vehicles
WHERE self_contained = true
   OR self_contained_expiry IS NOT NULL
ORDER BY updated_at DESC
LIMIT 10;
```

---

## 🐛 Troubleshooting

### Issue: "Vehicle details not populating"
**Cause**: Canonical vehicle has `NULL` values AND no historical observations with vehicle details  
**Fix**: 
1. Check database: `SELECT * FROM canonical_vehicles WHERE plate_number = 'XXX'`
2. Check observations: `SELECT * FROM vehicle_observations_v2 WHERE plate_number = 'XXX' AND vehicle_make IS NOT NULL`
3. If both empty, this is a new vehicle - AI scan should populate on first observation

---

### Issue: "Recent Activity shows nothing"
**Cause**: Query filtering by wrong `recorded_by` user ID  
**Fix**:
1. Check officer ID: `SELECT id, email FROM user_profiles WHERE email = '<OFFICER_EMAIL>'`
2. Verify observations exist: `SELECT COUNT(*) FROM vehicle_observations_v2 WHERE recorded_by = '<OFFICER_ID>'`
3. Check RecentActivityList component is using correct table: `vehicle_observations_v2`

---

### Issue: "Shift Records shows wrong data"
**Cause**: Query using old table or wrong FK references  
**Fix**:
1. Verify `shift-records.tsx` imports `getShiftRecords` from `vehicleRecords.ts`
2. Check `vehicleRecords.ts` queries `vehicle_observations_v2` table
3. Ensure display using `record.plate_number` not `record.vehicle?.plate_number`

---

### Issue: "NZSCV check fails"
**Cause**: Edge function not deployed or NZSCV website unavailable  
**Fix**:
1. Deploy edge function: `supabase functions deploy check-nzscv-status`
2. Check edge function logs: `supabase functions logs check-nzscv-status`
3. Verify NZSCV website is online: https://www.nzscv.co.nz
4. Officer can still manually verify via "Update Status" button

---

## 📊 Database Health Check

Run these queries to verify schema migration integrity:

```sql
-- 1. Check table exists and has data
SELECT COUNT(*) as total_observations
FROM vehicle_observations_v2;

-- 2. Verify plate_number FK is working
SELECT 
  COUNT(*) as observations_with_valid_plate
FROM vehicle_observations_v2 v
JOIN canonical_vehicles c ON v.plate_number = c.plate_number;

-- 3. Check for orphaned observations (plate not in canonical_vehicles)
SELECT COUNT(*) as orphaned_observations
FROM vehicle_observations_v2 v
LEFT JOIN canonical_vehicles c ON v.plate_number = c.plate_number
WHERE c.plate_number IS NULL;

-- 4. Verify homeless_status enum values
SELECT 
  homeless_status,
  COUNT(*) as count
FROM canonical_vehicles
GROUP BY homeless_status;

-- 5. Check officer notes usage
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE has_notes = true) as with_notes,
  COUNT(*) FILTER (WHERE breach_warning = true) as with_breach_warning
FROM vehicle_observations_v2;

-- 6. Verify single photo URL (not JSON array)
SELECT 
  observation_id,
  plate_number,
  photo,
  pg_typeof(photo) as photo_type
FROM vehicle_observations_v2
WHERE photo IS NOT NULL
LIMIT 5;
```

---

## ✅ Success Criteria

**All tests pass when:**
- [ ] Manual plate lookup populates vehicle details from database or historical observations
- [ ] Camera scan → AI analysis → Save → ObservationReviewModal workflow completes
- [ ] Historical data downloads on login (3 days, 1 photo per observation)
- [ ] Shift records display all observations with correct data
- [ ] Recent activity widget shows last 5 observations
- [ ] Officer notes saved and displayed correctly
- [ ] Breach detection triggers and displays warnings
- [ ] NZSCV registry checks automatically and updates database
- [ ] ObservationReviewModal shows all information and quick actions
- [ ] No console errors about missing tables or invalid FK references

---

## 🚀 Next Steps After Testing

1. **Fix any database schema mismatches** found during testing
2. **Add missing columns** if NZSCV integration incomplete:
   ```sql
   ALTER TABLE canonical_vehicles
   ADD COLUMN IF NOT EXISTS nzscv_last_checked TIMESTAMPTZ,
   ADD COLUMN IF NOT EXISTS nzscv_source TEXT CHECK (nzscv_source IN ('nzscv_auto', 'manual_verified', 'officer_override'));
   ```
3. **Deploy edge functions** if not already deployed:
   ```bash
   supabase functions deploy check-nzscv-status
   supabase functions deploy process-field-scan
   ```
4. **Test offline queue sync** with new schema fields
5. **Implement missing UI features**:
   - Officer notes input in ObservationReviewModal
   - Breach warning display in ComplianceStatusModal
   - Homeless claim form integration
   - Person details form
6. **Performance testing** with large datasets (1000+ observations)

---

**Migration Status**: ✅ COMPLETE  
**Testing Status**: 🔄 READY FOR TESTING  
**Production Ready**: ⏳ PENDING TEST VERIFICATION
