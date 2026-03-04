# End-to-End Vehicle Observation Workflow Test Guide

## ✅ Schema Migration Fixed
**CRITICAL FIX APPLIED**: Updated `services/vehicleObservation.ts` to use `vehicle_observations_v2` table with new schema.

---

## Test Workflow Steps

### 1. **Scan Vehicle → OnSpace AI Analysis**

**Expected Flow:**
1. User taps **"New Observation"** on dashboard
2. User enters plate manually OR taps **"Scan"** button
3. Camera screen shows manual button with **"Scan Vehicle"**
4. User taps **"Scan Vehicle"** → native camera opens
5. User captures photo → OnSpace AI processes image
6. **EnhancedScanResultModal** displays:
   - Plate number (editable)
   - Vehicle make/model/color/year
   - Self-contained sticker detected (Yes/No)
   - Photo preview
   - Options: Retake / Add More Photos / Save

**Files Involved:**
- `app/(tabs)/observe.tsx` - Main observation screen
- `components/PlateScanner.tsx` - Camera integration
- `components/EnhancedScanResultModal.tsx` - AI results display
- `services/onspaceAI.ts` - OnSpace AI vision analysis

**Test Checkpoints:**
- ✅ Camera permission granted
- ✅ Photo captured successfully
- ✅ OnSpace AI returns plate number
- ✅ Vehicle details populated (make/model/color)
- ✅ Self-contained status detected
- ✅ Photo displayed in modal
- ✅ User can add multiple photos

---

### 2. **Save Observation**

**Expected Flow:**
1. User confirms data in EnhancedScanResultModal → taps **"Save"**
2. Modal calls `handleScanComplete(finalData)` in observe.tsx
3. Form auto-populated with:
   - Plate number
   - Vehicle make/model/color/year
   - Self-contained status (checkbox)
   - Evidence photos array
4. User optionally adds notes
5. User taps **"Record Observation"**
6. `createVehicleObservation()` called from `services/vehicleObservation.ts`

**Database Operations:**
```typescript
// Step 1: Get or create canonical vehicle
// Uses RPC: get_or_create_canonical_vehicle(plate_number, make, model, color)

// Step 2: Insert into vehicle_observations_v2
INSERT INTO vehicle_observations_v2 (
  plate_number,           -- ✅ Direct FK to canonical_vehicles
  vehicle_make,
  vehicle_model,
  vehicle_color,
  organization_id,
  zone_id,
  recorded_by,
  recorded_at,
  self_contained,         -- ✅ NEW schema
  photo,                  -- ✅ Single URL (not JSON)
  gps_latitude,
  gps_longitude,
  gps_accuracy,
  officer_notes,          -- ✅ NEW schema
  has_notes,              -- ✅ NEW field
  is_compliant
)

// Step 3: Trigger compliance evaluation
// Edge Function: process-field-scan
```

**Files Involved:**
- `services/vehicleObservation.ts` - **NOW USING vehicle_observations_v2** ✅
- `services/offlineQueue.ts` - Offline sync if network unavailable

**Test Checkpoints:**
- ✅ Canonical vehicle created/updated
- ✅ Observation inserted into `vehicle_observations_v2`
- ✅ Plate number stored correctly
- ✅ Officer notes saved to `officer_notes` column
- ✅ `has_notes` flag set correctly
- ✅ Single photo URL stored (not JSON array)
- ✅ GPS coordinates recorded
- ✅ Zone ID linked correctly
- ✅ Success alert displayed

---

### 3. **Check Shift Records**

**Expected Flow:**
1. User navigates to **"Recent History"** or shift records screen
2. Screen displays all observations from current shift
3. User's own observations marked with **"YOU"** badge
4. Recent observations (< 24h) show **"Delete"** button
5. Old observations (> 24h) show **"🔒 Locked"**

**Database Query:**
```sql
SELECT *
FROM vehicle_observations_v2
WHERE recorded_at >= [shift_start_time]
ORDER BY recorded_at DESC
```

**Files Involved:**
- `app/shift-records.tsx` - **NOW USING vehicle_observations_v2** ✅
- `services/vehicleRecords.ts` - **NOW USING vehicle_observations_v2** ✅

**Test Checkpoints:**
- ✅ All shift observations displayed
- ✅ Own observations marked
- ✅ Plate number displayed correctly (from `plate_number` column)
- ✅ Vehicle details shown (make/model/color from observation record)
- ✅ Zone name displayed
- ✅ Compliance status shown
- ✅ Edit/delete permissions working (24-hour window)

---

### 4. **Verify Database Entry**

**Manual Database Verification:**

```sql
-- Check latest observation
SELECT 
  observation_id,
  plate_number,           -- ✅ Should match scanned plate
  vehicle_make,
  vehicle_model,
  vehicle_color,
  self_contained,         -- ✅ Should match sticker detection
  photo,                  -- ✅ Should be single URL
  officer_notes,          -- ✅ Should contain user's notes
  has_notes,              -- ✅ Should be true if notes exist
  gps_latitude,
  gps_longitude,
  zone_id,
  recorded_by,
  is_compliant,
  created_at
FROM vehicle_observations_v2
WHERE plate_number = '[SCANNED_PLATE]'
ORDER BY created_at DESC
LIMIT 1;

-- Check canonical vehicle updated
SELECT 
  plate_number,
  vehicle_make,
  vehicle_model,
  vehicle_color,
  total_observations,     -- ✅ Should increment
  last_seen_at,           -- ✅ Should update
  profile_photo,
  is_flagged,
  homeless_status
FROM canonical_vehicles
WHERE plate_number = '[SCANNED_PLATE]';

-- Check compliance evaluation (if edge function ran)
SELECT 
  observation_id,
  is_compliant,
  violation_reasons,
  matrix_snapshot
FROM compliance_results
WHERE observation_id = '[OBSERVATION_ID]';
```

**Expected Results:**
- ✅ **vehicle_observations_v2** has new row
- ✅ `plate_number` matches scanned plate (uppercase)
- ✅ `officer_notes` contains user's notes (if entered)
- ✅ `has_notes` = `true` if notes exist
- ✅ `self_contained` = detected sticker status
- ✅ `photo` = single URL (not JSON)
- ✅ GPS coordinates match location
- ✅ `zone_id` matches current zone
- ✅ **canonical_vehicles** `total_observations` incremented
- ✅ **canonical_vehicles** `last_seen_at` updated
- ✅ **compliance_results** row created (if edge function succeeded)

---

## Common Issues & Troubleshooting

### Issue 1: "Cannot coerce to single JSON object"
**Cause:** Using `.maybeSingle()` or `.single()` without `.limit(1)`
**Fix:** All queries now use `.limit(1)` pattern ✅

### Issue 2: Duplicate observations
**Cause:** 4-hour duplicate detection not working
**File:** `services/vehicleRecords.ts` - `checkRecentDuplicate()`
**Fix:** Now uses `vehicle_observations_v2` with `plate_number` ✅

### Issue 3: Historical data not loading
**Cause:** `historicalDataSync.ts` using old schema
**Fix:** Now uses `vehicle_observations_v2` and parses `homeless_status` enum ✅

### Issue 4: Offline queue sync fails
**Cause:** Offline queue using old schema structure
**Fix:** Updated to use new column names (`officer_notes`, `self_contained`, `photo`) ✅

---

## Test Checklist

### ✅ Before Testing
- [ ] GPS location enabled
- [ ] Camera permissions granted
- [ ] Logged in as field officer
- [ ] Assigned to organization
- [ ] In a monitored zone

### ✅ During Test
- [ ] Camera opens without "Scan Failed"
- [ ] OnSpace AI detects plate number
- [ ] Vehicle details auto-populated
- [ ] Self-contained sticker detected
- [ ] Form fields editable
- [ ] Notes field works
- [ ] Submit shows success alert
- [ ] Observation appears in shift records

### ✅ After Test
- [ ] Database entry in `vehicle_observations_v2`
- [ ] Canonical vehicle updated
- [ ] Compliance results generated
- [ ] Historical data synced
- [ ] Offline queue empty (if online)

---

## Schema Reference

### vehicle_observations_v2 (Active Table)
```sql
CREATE TABLE vehicle_observations_v2 (
  observation_id UUID PRIMARY KEY,
  plate_number TEXT REFERENCES canonical_vehicles(plate_number),
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  vehicle_color TEXT,
  self_contained BOOLEAN,
  photo TEXT,                    -- Single URL
  gps_latitude NUMERIC,
  gps_longitude NUMERIC,
  organization_id UUID,
  zone_id UUID,
  recorded_by UUID,
  recorded_at TIMESTAMPTZ,
  officer_notes TEXT,            -- NEW
  has_notes BOOLEAN,             -- NEW
  is_compliant BOOLEAN,
  created_at TIMESTAMPTZ
);
```

### canonical_vehicles (Primary Key = plate_number)
```sql
CREATE TABLE canonical_vehicles (
  plate_number TEXT PRIMARY KEY,
  vehicle_id UUID,               -- Kept for backward compatibility
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_color TEXT,
  total_observations INTEGER,
  last_seen_at TIMESTAMPTZ,
  homeless_status TEXT CHECK (IN ('none', 'claimed', 'confirmed')),
  is_flagged BOOLEAN,
  profile_photo TEXT
);
```

---

## Success Criteria

**Test passes if:**
1. ✅ Photo captured and processed by OnSpace AI
2. ✅ Plate number detected correctly
3. ✅ Observation saved to `vehicle_observations_v2`
4. ✅ All new schema fields populated correctly
5. ✅ Shift records display the observation
6. ✅ Edit/delete permissions work (24-hour window)
7. ✅ Canonical vehicle stats updated
8. ✅ Compliance evaluation triggered

---

## Next Steps After Testing

If all tests pass:
- ✅ Schema migration complete
- ✅ Mobile app fully compatible with new backend
- ✅ Ready for production use

If tests fail:
- Check console logs for specific errors
- Verify database schema matches expected structure
- Check network tab for failed API calls
- Review edge function logs for compliance evaluation errors
