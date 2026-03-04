# Vehicle Lookup Debugging Guide

## Issue
Plate number `NYR607` shows "17 previous observations" but vehicle details (make/model/color) are not populating.

## Test Queries

Run these queries in Supabase SQL Editor to verify data exists:

### 1. Check Canonical Vehicle Record
```sql
SELECT 
  plate_number,
  vehicle_make,
  vehicle_model,
  vehicle_color,
  vehicle_year,
  total_observations,
  self_contained,
  self_contained_expiry,
  is_flagged
FROM canonical_vehicles
WHERE plate_number = 'NYR607';
```

**Expected**: Should return 1 row with plate_number='NYR607' and possibly NULL/empty values for vehicle_make/model/color

### 2. Check Historical Observations with Vehicle Details
```sql
SELECT 
  observation_id,
  plate_number,
  vehicle_make,
  vehicle_model,
  vehicle_color,
  vehicle_year,
  recorded_at,
  recorded_by
FROM vehicle_observations_v2
WHERE plate_number = 'NYR607'
  AND vehicle_make IS NOT NULL
  AND vehicle_model IS NOT NULL
  AND vehicle_color IS NOT NULL
ORDER BY recorded_at DESC
LIMIT 5;
```

**Expected**: Should return observations with populated vehicle details (make/model/color)

### 3. Test the Enhanced Lookup Logic
```sql
-- This simulates what lookupCanonicalVehicle() does

-- Step 1: Get canonical vehicle
WITH canonical AS (
  SELECT * 
  FROM canonical_vehicles 
  WHERE plate_number = 'NYR607'
  LIMIT 1
),
-- Step 2: Check if canonical has missing details
has_missing AS (
  SELECT 
    *,
    (vehicle_make IS NULL OR vehicle_model IS NULL OR vehicle_color IS NULL) as missing_details
  FROM canonical
),
-- Step 3: Get most recent observation with details
recent_obs AS (
  SELECT 
    vehicle_make,
    vehicle_model,
    vehicle_color,
    vehicle_year,
    recorded_at
  FROM vehicle_observations_v2
  WHERE plate_number = 'NYR607'
    AND vehicle_make IS NOT NULL
    AND vehicle_model IS NOT NULL
    AND vehicle_color IS NOT NULL
  ORDER BY recorded_at DESC
  LIMIT 1
)
-- Step 4: Merge the results
SELECT 
  c.plate_number,
  COALESCE(c.vehicle_make, o.vehicle_make) as vehicle_make,
  COALESCE(c.vehicle_model, o.vehicle_model) as vehicle_model,
  COALESCE(c.vehicle_color, o.vehicle_color) as vehicle_color,
  COALESCE(c.vehicle_year, o.vehicle_year) as vehicle_year,
  c.total_observations,
  c.missing_details as had_missing_details,
  o.recorded_at as details_from_observation_at
FROM has_missing c
LEFT JOIN recent_obs o ON true;
```

**Expected**: Should return merged data with vehicle make/model/color from either canonical OR recent observation

## Debugging Steps

1. **Run Query 1** - Verify canonical vehicle exists
   - ✅ If it returns data: Canonical vehicle exists
   - ❌ If empty: Vehicle not in canonical_vehicles table (shouldn't happen if "17 observations" message shows)

2. **Run Query 2** - Verify historical observations have details
   - ✅ If returns 1+ rows: Historical data exists with vehicle details
   - ❌ If empty: No observations have vehicle make/model/color populated
     - This means the issue is upstream - observations were created without vehicle details

3. **Run Query 3** - Test merge logic
   - ✅ If returns merged data: Database query works correctly - issue is in mobile app code
   - ❌ If returns NULL vehicle details: Data doesn't exist in database

## Mobile App Console Check

When you type "NYR607" in the app, check the console logs for:

```
✅ Existing vehicle found: NYR607 {
  dbMake: '(empty)',
  dbModel: '(empty)',
  dbColor: '(empty)'
}
```

OR

```
⚠️ Canonical vehicle has missing details, checking historical observations...
✅ Found vehicle details in historical observation: { vehicle_make: 'Toyota', ... }
```

## Solution Based on Results

### Scenario A: Database has the data, app doesn't fetch it
**Fix**: Update `lookupCanonicalVehicle` function to properly merge historical data

### Scenario B: Database doesn't have vehicle details in ANY table
**Root Cause**: Observations were created without vehicle make/model/color
**Fix**: 
1. Update past observations using OnSpace AI to analyze existing photos
2. Ensure future observations capture vehicle details from AI scan or manual entry

### Scenario C: Merge logic works but UI state doesn't update
**Fix**: Check React state update logic in `handleVehicleLookup`

## Next Steps

1. Run the three SQL queries above
2. Share the results
3. Based on the data, I'll provide the exact fix needed
