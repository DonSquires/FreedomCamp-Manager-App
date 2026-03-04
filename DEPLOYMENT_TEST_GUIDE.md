# 🚀 Edge Function Deployment & Test Guide

## Step 1: Deploy the Edge Function

**Prerequisites:**
- Supabase CLI installed (`npm install -g supabase`)
- Logged in to Supabase CLI (`supabase login`)
- Linked to your project (`supabase link --project-ref xbfnlzmpumthnjmtqufp`)

**Deploy Command:**
```bash
supabase functions deploy import-historical-data
```

**Expected Output:**
```
Deploying function import-historical-data...
Function import-historical-data deployed successfully!
URL: https://xbfnlzmpumthnjmtqufp.supabase.co/functions/v1/import-historical-data
```

---

## Step 2: Create Test Zones (REQUIRED BEFORE TESTING!)

Before testing the import, create the 3 zones referenced in the test file:

```sql
-- Run this in Supabase SQL Editor
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get first active organization
  SELECT id INTO v_org_id FROM organizations WHERE is_active = true LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found!';
  END IF;
  
  -- Create test zones (WITHOUT LINZ prefix - the import function strips it automatically)
  INSERT INTO zones (organization_id, name, description, is_active)
  VALUES 
    (v_org_id, 'Jacksons Inlet', 'Test zone for historical import', true),
    (v_org_id, 'Champagne Gully', 'Test zone for historical import', true),
    (v_org_id, 'Bendigo', 'Test zone for historical import', true),
    (v_org_id, 'Lowburn', 'Test zone for historical import', true)
  ON CONFLICT (organization_id, name) DO NOTHING;
  
  RAISE NOTICE 'Test zones created successfully';
END $$;
```

**Verify zones were created:**
```sql
SELECT id, name FROM zones 
WHERE name IN ('Jacksons Inlet', 'Champagne Gully', 'Bendigo', 'Lowburn')
ORDER BY name;
```

Expected: 4 rows returned

**Note:** The test data uses "LINZ - Jacksons Inlet" format, but zones are stored as "Jacksons Inlet" (without prefix). The import function automatically strips the "LINZ - " prefix before matching.

---

## Step 3: Test with 10 Records

**Option A: Using curl (Command Line)**

```bash
curl -X POST 'https://xbfnlzmpumthnjmtqufp.supabase.co/functions/v1/import-historical-data' \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d @test-import-10-records.json
```

**Option B: Using JavaScript/Node**

Create `test-import.js`:
```javascript
const https = require('https');
const fs = require('fs');

const SUPABASE_URL = 'https://xbfnlzmpumthnjmtqufp.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Get from Supabase Dashboard

const testData = JSON.parse(fs.readFileSync('test-import-10-records.json', 'utf8'));
const payload = JSON.stringify(testData);

const options = {
  hostname: new URL(SUPABASE_URL).hostname,
  path: '/functions/v1/import-historical-data',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log('🧪 Testing import with 10 records...\n');

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => data += chunk);
  
  res.on('end', () => {
    console.log(`HTTP Status: ${res.statusCode}\n`);
    console.log('Response:', JSON.stringify(JSON.parse(data), null, 2));
  });
});

req.on('error', (error) => console.error('Error:', error));
req.write(payload);
req.end();
```

Run with: `node test-import.js`

---

## Step 4: Verify Test Results

### Expected Response
```json
{
  "success": true,
  "summary": {
    "total": 10,
    "successful": 10,
    "failed": 0,
    "errors": [],
    "zonesNotFound": []
  },
  "observations": [
    {
      "id": "uuid...",
      "plate": "FIS5NO",
      "zone": "Jacksons Inlet",
      "date": "2026-02-03T12:00:00.000Z"
    },
    // ... 9 more
  ]
}
```

### Check Database

**1. Verify observations were created:**
```sql
SELECT 
  observation_id,
  plate_number,
  recorded_at,
  officer_notes,
  z.name as zone_name
FROM vehicle_observations_v2 v
JOIN zones z ON z.id = v.zone_id
WHERE v.officer_notes LIKE '%Imported from historical%'
ORDER BY v.recorded_at DESC
LIMIT 10;
```

**Expected: 10 rows with zone names:**
- `Jacksons Inlet` (not "LINZ - Jacksons Inlet")
- `Champagne Gully` (not "LINZ - Champagne Gully")
- `Bendigo`
- `Lowburn`

**Note:** The Excel file has "LINZ - [Zone Name]" but the import function strips the prefix automatically.
```

**Expected: 10 rows**

**2. Verify plate numbers are correct:**
```sql
SELECT 
  plate_number,
  officer_notes
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'
ORDER BY plate_number;
```

**Expected plate numbers:**
- `922D6` (cleaned from "922d6")
- `ABC123`
- `FIS5NO` (cleaned from "Fis5NO")
- `HSM82` (cleaned from "Hsm82")
- `PIP93` (cleaned from "Pip93")
- `QEY735` (cleaned from "Qey735")
- `TEST01`
- `TEST02`
- `TEST03`
- `XYZ789`

**3. Verify officer notes were preserved:**
```sql
SELECT 
  plate_number,
  officer_notes
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'
  AND officer_notes NOT LIKE 'Imported from historical data (ID:%'
ORDER BY plate_number;
```

**Expected rows with custom notes:**
- `PIP93`: "Vehicle parked overnight (Imported from historical data ID: 8882)"
- `QEY735`: "Self-contained sticker visible (Imported from historical data ID: 8880)"
- `TEST02`: "Officer approached vehicle (Imported from historical data ID: 8876)"
- `XYZ789`: "Repeat offender (Imported from historical data ID: 8878)"

**4. Verify dates were parsed correctly:**
```sql
SELECT 
  plate_number,
  recorded_at::date as observation_date
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'
ORDER BY recorded_at DESC;
```

**Expected dates:**
- 3 records: `2026-02-03` (from "3/02/2026")
- 2 records: `2026-02-02` (from "2/02/2026")
- 2 records: `2026-02-01` (from "1/02/2026")
- 1 record: `2026-01-31` (from "31/01/2026")
- 1 record: `2026-01-30` (from "30/01/2026")
- 1 record: `2026-01-29` (from "29/01/2026")

**5. Verify canonical vehicles were created:**
```sql
SELECT 
  plate_number,
  total_observations,
  first_seen_at::date,
  last_seen_at::date
FROM canonical_vehicles
WHERE plate_number IN ('FIS5NO', 'HSM82', 'PIP93', '922D6', 'QEY735', 'ABC123', 'XYZ789', 'TEST01', 'TEST02', 'TEST03')
ORDER BY plate_number;
```

**Expected: 10 rows** (one per unique plate)

**6. Verify monthly stays were calculated:**
```sql
SELECT 
  cv.plate_number,
  ms.calendar_month,
  ms.nights_stayed,
  ms.consecutive_nights
FROM vehicle_monthly_stays ms
JOIN canonical_vehicles cv ON cv.plate_number = ms.plate_number
WHERE cv.plate_number IN ('FIS5NO', 'HSM82', 'PIP93')
  AND ms.calendar_month = '2026-02-01'
ORDER BY cv.plate_number;
```

**Expected: 3+ rows** (depends on overnight detection logic)

---

## Step 5: Test Validation Checklist

- [ ] **Deployment successful** - Edge Function deployed without errors
- [ ] **Test zones created** - 3 zones exist in database
- [ ] **Import response success** - HTTP 200, `"success": true`
- [ ] **10 observations created** - All records imported
- [ ] **Plate numbers cleaned** - Uppercase, no special chars (FIS5NO not Fis5NO)
- [ ] **Dates parsed correctly** - DD/MM/YYYY → ISO timestamps at noon
- [ ] **Officer notes preserved** - Custom notes appear with "(Imported...)" suffix
- [ ] **Empty notes handled** - Default "Imported from historical data (ID: X)" for empty notes
- [ ] **Zones matched** - All observations linked to correct zone
- [ ] **Canonical vehicles created** - 10 unique vehicles in canonical_vehicles
- [ ] **Monthly stays calculated** - Trigger fired and updated tracking

---

## 🎯 If All Tests Pass

**You're ready for the full import!**

```bash
# Full import using batch script
node batch-import-script.js
```

This will import all 8553 records in 86 batches (~3-5 minutes).

---

## ❌ If Tests Fail

### Error: "Zone not found"
**Solution:** Run the zone creation SQL from Step 2

### Error: "Invalid date format"
**Check:** Are dates in DD/MM/YYYY format? Console log shows which record failed.

### Error: "Invalid plate number"
**Check:** Is `rego` field populated? Console log shows which record failed.

### Error: "Function not found"
**Solution:** Redeploy: `supabase functions deploy import-historical-data`

### Plates not cleaned correctly (e.g., "Fis5NO" instead of "FIS5NO")
**Check:** `cleanPlateNumber()` function in Edge Function

### Officer notes not preserved
**Check:** 
```sql
SELECT officer_notes FROM vehicle_observations_v2 
WHERE plate_number = 'PIP93';
```
Expected: "Vehicle parked overnight (Imported from historical data ID: 8882)"

---

## 📊 Expected Console Output (Success)

```
🧪 Testing import with 10 records...

HTTP Status: 200

Response: {
  "success": true,
  "summary": {
    "total": 10,
    "successful": 10,
    "failed": 0,
    "errors": [],
    "zonesNotFound": []
  },
  "observations": [
    {
      "id": "d4e5f6g7-h8i9-j0k1-l2m3-n4o5p6q7r8s9",
      "plate": "FIS5NO",
      "zone": "Jacksons Inlet",
      "date": "2026-02-03T12:00:00.000Z"
    },
    {
      "id": "e5f6g7h8-i9j0-k1l2-m3n4-o5p6q7r8s9t0",
      "plate": "HSM82",
      "zone": "Jacksons Inlet",
      "date": "2026-02-03T12:00:00.000Z"
    },
    // ... 8 more observations
  ]
}
```

**✅ All good! Proceed with full import.**

---

## 🚀 Next: Full Import

Once test passes, proceed to full import:

1. **Convert full Excel file** to JSON (see `HISTORICAL_IMPORT_GUIDE.md`)
2. **Create all missing zones** (extract unique `Title` values, create zones)
3. **Update batch-import-script.js** with your Supabase anon key
4. **Run full import**: `node batch-import-script.js`
5. **Verify 8553 records** imported successfully

See `BATCH_IMPORT_INSTRUCTIONS.md` for complete step-by-step guide.
