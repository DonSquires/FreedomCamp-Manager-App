# 📦 Batch Import Instructions for 8553 Records

## Why Batch Import is Required

**CRITICAL**: Do NOT attempt to import all 8553 records at once!

**Problems with single import:**
- ❌ Edge Function timeout (>60 seconds)
- ❌ Database trigger overload (8553 × `trigger_update_monthly_stays`)
- ❌ Memory limits exceeded
- ❌ Network payload size limits

**Solution: Batch Import**
- ✅ Import 100 records at a time
- ✅ 86 batches total
- ✅ ~3 minutes total time
- ✅ Safe for database and server

---

## 🚀 Step-by-Step Import Process

### Step 1: Convert Excel to JSON

**Option A: Using Excel + Online Converter**
1. Open `Vehicle Log.xlsx`
2. **File → Save As → CSV (Comma delimited)** → Save as `vehicle-log.csv`
3. Go to https://csvjson.com/csv2json
4. Upload `vehicle-log.csv`
5. Download as `vehicle-log.json`

**Option B: Using Python Script**
```python
import csv
import json

records = []
with open('vehicle-log.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        records.append({
            'id': int(row['ID']),
            'title': row['Title'],
            'recordedEREGO': row['RecordedEREGO'],
            'note': row['Note'],
            'attachments': int(row['Attachments'])
        })

with open('vehicle-log.json', 'w') as f:
    json.dump({'records': records}, f, indent=2)

print(f"✅ Converted {len(records)} records")
```

Save as `convert.py` and run: `python convert.py`

---

### Step 2: Create Missing Zones (IMPORTANT!)

**Before importing, create zones for all location names:**

Run this SQL in Supabase to create all zones at once:

```sql
DO $$
DECLARE
  v_org_id uuid;
  location_names text[] := ARRAY[
    'Jacksons I',
    'Champagn',
    'Bendigo',
    'Kawarau',
    'Lake Hayes',
    'Waterfront',
    'Queenstown Bay'
    -- Add all other location names from your Excel "Title" column
  ];
  location_name text;
BEGIN
  -- Get first active organization
  SELECT id INTO v_org_id FROM organizations WHERE is_active = true LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found!';
  END IF;
  
  -- Create zones
  FOREACH location_name IN ARRAY location_names
  LOOP
    IF NOT EXISTS (SELECT 1 FROM zones WHERE name = location_name) THEN
      INSERT INTO zones (
        organization_id,
        name,
        description,
        is_active,
        self_contained_required,
        nights_per_month,
        max_consecutive_nights
      ) VALUES (
        v_org_id,
        location_name,
        'Historical import zone',
        true,
        true,
        28,
        3
      );
      RAISE NOTICE 'Created zone: %', location_name;
    ELSE
      RAISE NOTICE 'Zone already exists: %', location_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Done! Created zones for all locations.';
END $$;
```

**To get all unique location names from your Excel:**
1. Open `vehicle-log.json`
2. Extract unique `title` values
3. Add them to the `location_names` array above

---

### Step 3: Update Batch Import Script

1. Open `batch-import-script.js`
2. Update configuration:

```javascript
const SUPABASE_URL = 'https://xbfnlzmpumthnjmtqufp.supabase.co'; // ✅ Already correct
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE'; // ⚠️ UPDATE THIS!
const BATCH_SIZE = 100; // ✅ Good default
const DELAY_MS = 2000; // ✅ 2 seconds between batches
const INPUT_FILE = 'vehicle-log.json'; // ✅ Your converted file
```

**Get your Supabase Anon Key:**
1. Go to Supabase Dashboard
2. **Settings → API**
3. Copy `anon public` key
4. Paste into script

---

### Step 4: Run Batch Import

**Install Node.js** (if not installed):
- Download from https://nodejs.org
- Install LTS version

**Run the import:**
```bash
# Make sure you're in the same folder as:
# - batch-import-script.js
# - vehicle-log.json

node batch-import-script.js
```

**Expected output:**
```
🚀 HISTORICAL DATA BATCH IMPORT
================================

📊 Import Summary:
   - Total records: 8553
   - Batch size: 100
   - Total batches: 86
   - Estimated time: ~172 seconds

Continue with import? (yes/no): yes

🔄 Starting batch import...

📦 Batch 1/86 - Importing 100 records...
✅ Batch 1 complete:
   - Successful: 100
   - Failed: 0
⏳ Waiting 2s before next batch...

📦 Batch 2/86 - Importing 100 records...
✅ Batch 2 complete:
   - Successful: 100
   - Failed: 0
⏳ Waiting 2s before next batch...

... (continues for all 86 batches)

================================
✅ IMPORT COMPLETE!
================================

📊 Final Results:
   - Total processed: 8553
   - Successful: 8553 ✅
   - Failed: 0 ❌
   - Duration: 174s

🎉 All done!
```

---

### Step 5: Verify Import

**Check observations were created:**
```sql
SELECT 
  COUNT(*) as total_imported,
  MIN(recorded_at) as earliest_date,
  MAX(recorded_at) as latest_date
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%';
```

Expected: `total_imported = 8553`

**Check monthly stays were calculated:**
```sql
SELECT 
  COUNT(*) as total_vehicles,
  SUM(nights_stayed) as total_nights
FROM vehicle_monthly_stays;
```

**Check canonical vehicles created:**
```sql
SELECT 
  COUNT(*) as total_vehicles
FROM canonical_vehicles
WHERE first_seen_at >= '2026-01-01'; -- Adjust date based on your data
```

**Check zones distribution:**
```sql
SELECT 
  z.name as zone_name,
  COUNT(v.observation_id) as observation_count
FROM vehicle_observations_v2 v
JOIN zones z ON z.id = v.zone_id
WHERE v.officer_notes LIKE '%Imported from historical%'
GROUP BY z.name
ORDER BY observation_count DESC;
```

---

## 🛠️ Troubleshooting

### Error: "Zone not found: [Location Name]"

**Cause:** Missing zone in database

**Solution:**
1. Note which zones failed
2. Create them using SQL:
```sql
INSERT INTO zones (organization_id, name, is_active)
VALUES (
  (SELECT id FROM organizations LIMIT 1),
  'Missing Zone Name',
  true
);
```
3. Re-run import script (it will skip already-imported records)

---

### Error: "Invalid date format"

**Cause:** Date parsing failed

**Solution:**
Check Excel date format is DD/MM/YYYY. If different, update the Edge Function:

```typescript
// In supabase/functions/import-historical-data/index.ts
// Modify parseDate() function to match your format
```

---

### Script Crashes Mid-Import

**Recovery:**
1. Script saves progress to `import-progress-[timestamp].json`
2. Check which batch failed in console output
3. Fix the error (e.g., create missing zone)
4. Extract `remainingRecords` from progress file
5. Create new JSON file with only remaining records
6. Re-run script with smaller file

**Example recovery:**
```javascript
// Load progress file
const progress = require('./import-progress-1234567890.json');

// Save remaining records
const fs = require('fs');
fs.writeFileSync('vehicle-log-remaining.json', JSON.stringify({
  records: progress.remainingRecords
}, null, 2));

// Update script to use new file
const INPUT_FILE = 'vehicle-log-remaining.json';

// Re-run
node batch-import-script.js
```

---

## 📊 Performance Expectations

**For 8553 records:**
- Batches: 86
- Records per batch: 100
- Delay per batch: 2 seconds
- Database trigger per record: ~200ms
- **Total time: ~3-5 minutes**

**Live Progress:**
```
Batch 1/86:  1.2% complete ▓░░░░░░░░░░░░░░░░░░░
Batch 10/86: 11.6% complete ▓▓░░░░░░░░░░░░░░░░░░
Batch 43/86: 50.0% complete ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░
Batch 86/86: 100% complete  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
```

---

## ✅ Post-Import Checklist

- [ ] All 8553 records imported successfully
- [ ] Monthly stays calculated for all vehicles
- [ ] Canonical vehicles created/updated
- [ ] Zones distribution looks correct
- [ ] No orphaned records (all have valid zone_id)
- [ ] Date range matches Excel file dates

**Verification SQL:**
```sql
-- Summary report
SELECT 
  'Observations' as table_name,
  COUNT(*) as count
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'

UNION ALL

SELECT 
  'Monthly Stays',
  COUNT(*)
FROM vehicle_monthly_stays

UNION ALL

SELECT 
  'Canonical Vehicles',
  COUNT(*)
FROM canonical_vehicles
WHERE first_seen_at >= '2026-01-01'

UNION ALL

SELECT 
  'Photo Metadata',
  COUNT(*)
FROM photo_metadata
WHERE observation_id IN (
  SELECT observation_id 
  FROM vehicle_observations_v2 
  WHERE officer_notes LIKE '%Imported from historical%'
);
```

---

## 🎯 Next Steps After Import

1. **Update vehicle details** - Add make/model/color where available
2. **Add photos** - If you have historical photos, link them to observations
3. **Review compliance** - Check that monthly stays limits are enforced
4. **Verify zones** - Ensure all zones have correct GPS coordinates
5. **Test mobile app** - Verify historical data appears in observation history

**Ready to import? Follow steps 1-5 above!** 🚀
