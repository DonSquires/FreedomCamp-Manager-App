# Mobile App Schema Migration Audit

## Executive Summary
✅ **Most services updated correctly** - Already using new schema
⚠️ **Minor issues found** - Need small fixes for full compatibility

---

## Database Schema Changes (Completed in Backend)

### OLD SCHEMA (Deprecated)
```sql
canonical_vehicles_backup_20250203 (
  vehicle_id UUID PRIMARY KEY,
  is_homeless BOOLEAN,
  homeless_confirmed BOOLEAN
)
```

### NEW SCHEMA (Active)
```sql
canonical_vehicles (
  plate_number TEXT PRIMARY KEY,  -- ✅ Changed from vehicle_id
  homeless_status TEXT CHECK (IN ('none', 'claimed', 'confirmed')),  -- ✅ Unified enum
  total_notes INTEGER DEFAULT 0,
  last_note_at TIMESTAMPTZ,
  last_note_preview TEXT
)

vehicle_observations_v2 (
  -- Independent, immutable observation records
  plate_number TEXT REFERENCES canonical_vehicles(plate_number),
  officer_notes TEXT,
  has_notes BOOLEAN,
  notes_reference_previous BOOLEAN
)

vehicle_monthly_stays (
  -- Automatic calendar month tracking with resets
  plate_number TEXT,
  calendar_month DATE,
  nights_stayed INTEGER,
  consecutive_nights INTEGER
)
```

---

## Mobile App Files Audit

### ✅ CORRECT - Already Using New Schema

#### 1. **services/vehicleObservation.ts**
- ✅ Uses `canonical_vehicles` table
- ✅ Uses `plate_number` as lookup key (not `vehicle_id`)
- ✅ Uses `get_or_create_canonical_vehicle` RPC function
- ✅ No references to old `is_homeless`/`homeless_confirmed`
- ⚠️ **MINOR ISSUE**: Still uses `vehicle_observations` table instead of `vehicle_observations_v2`

#### 2. **services/historicalDataSync.ts**
- ✅ Uses `canonical_vehicles` table
- ✅ References `plate_number`, `is_flagged`, `homeless_status`
- ⚠️ **MINOR ISSUE**: Still references old `is_homeless`, `homeless_confirmed` fields
- ⚠️ **MINOR ISSUE**: Still uses `vehicle_observations` table instead of `vehicle_observations_v2`

#### 3. **services/vehicleDecisionHelper.ts**
- ✅ Correctly uses historical data from cache
- ✅ No direct database queries (depends on historicalDataSync)
- ⚠️ **INDIRECT ISSUE**: Depends on historicalDataSync which has schema issues

#### 4. **services/vehicleRecords.ts**
- ⚠️ **ISSUE**: Uses `vehicle_observations` table (should use `vehicle_observations_v2`)
- ⚠️ **ISSUE**: Queries `canonical_vehicles(plate_number)` via join which may fail

#### 5. **services/patrolService.ts**
- ✅ No vehicle-specific queries
- ✅ Only uses `patrols` table

#### 6. **services/incidentReporting.ts**
- ✅ Uses `vehicle_id` correctly for incident foreign keys (table still has this field)
- ✅ No canonical vehicle queries

---

### ⚠️ ISSUES FOUND - Need Fixes

#### 1. **app/(tabs)/observe.tsx** - Line 131
```typescript
// ❌ WRONG:
console.log('✅ Existing vehicle found:', vehicle.vehicle_id);

// ✅ CORRECT:
console.log('✅ Existing vehicle found:', vehicle.plate_number);
```

#### 2. **services/vehicleObservation.ts**
**Issue**: Uses `vehicle_observations` instead of `vehicle_observations_v2`

**Analysis**: Check backend to confirm which table is active. If `vehicle_observations_v2` is the new standard:
- Update all `.from('vehicle_observations')` to `.from('vehicle_observations_v2')`
- Update column references to match new schema

#### 3. **services/historicalDataSync.ts**
**Issues**:
- References old `is_homeless` (line 28)
- References old `homeless_confirmed` (line 29)

**Fix**:
```typescript
// ❌ OLD:
isHomeless: vehicle.is_homeless || false,
homelessConfirmed: vehicle.homeless_confirmed || false,

// ✅ NEW:
homelessStatus: vehicle.homeless_status || 'none',
```

#### 4. **services/vehicleRecords.ts**
**Issue**: Complex join query that may fail with new schema

**Analysis**: The query uses `.ilike('vehicle:canonical_vehicles(plate_number)', plateNumber)` which needs verification.

---

## Critical Questions for User

### 🔍 Question 1: Which table is active for observations?
Looking at the backend context, I see:
- `vehicle_observations` (with `vehicle_id` FK to `canonical_vehicles_backup_20250203.vehicle_id`)
- `vehicle_observations_v2` (new table mentioned in schema docs)

**Which table should the mobile app use?**
- Option A: Keep using `vehicle_observations` (current)
- Option B: Migrate to `vehicle_observations_v2` (new schema)

### 🔍 Question 2: Does canonical_vehicles still have vehicle_id?
The backend schema shows:
```
canonical_vehicles (
  plate_number TEXT PRIMARY KEY,
  ...
)
```

But no `vehicle_id` field listed. However, the RPC function `get_or_create_canonical_vehicle` returns a `vehicle_id`.

**Does canonical_vehicles table have a vehicle_id column?** (likely for backward compatibility)

---

## Recommended Fixes (Pending Confirmation)

### Fix 1: Update observe.tsx (Safe - Minor Fix)
```typescript
// Line 131 in app/(tabs)/observe.tsx
console.log('✅ Existing vehicle found:', vehicle.plate_number);
```

### Fix 2: Update historicalDataSync.ts (Safe - Schema Alignment)
```typescript
// Replace:
isHomeless: vehicle.is_homeless || false,
homelessConfirmed: vehicle.homeless_confirmed || false,

// With:
homelessStatus: vehicle.homeless_status || 'none',
```

### Fix 3: Table Migration Strategy (Needs Confirmation)

**IF vehicle_observations_v2 is the active table:**
1. Update all service files to use `vehicle_observations_v2`
2. Update column references:
   - `vehicle_id` → `plate_number`
   - Add `officer_notes`, `has_notes`, `notes_reference_previous`
3. Test all CRUD operations

**IF vehicle_observations is still active:**
- Keep current implementation
- Plan future migration when backend switches over

---

## Impact Assessment

### Low Risk (Can Fix Immediately)
- ✅ observe.tsx console.log fix
- ✅ historicalDataSync homeless status fields

### Medium Risk (Need Confirmation)
- ⚠️ Table name migration (vehicle_observations → vehicle_observations_v2)
- ⚠️ vehicleRecords.ts query updates

### High Risk (Requires Testing)
- ⚠️ Complete table migration with data validation

---

## Next Steps

1. **Confirm active table** - Which observations table is currently in use?
2. **Apply low-risk fixes** - Update console.log and homeless_status references
3. **Test database queries** - Verify all queries work with current schema
4. **Plan migration** - If table migration needed, create detailed plan

---

## Questions for User

Please confirm:
1. **Which observations table should the mobile app use?**
   - vehicle_observations (current)
   - vehicle_observations_v2 (new)

2. **Does canonical_vehicles table have a vehicle_id column?**
   - Yes (for backward compatibility)
   - No (plate_number is the only identifier)

3. **Should I proceed with low-risk fixes first?**
   - Yes - fix console.log and homeless_status references
   - No - wait for full migration plan
