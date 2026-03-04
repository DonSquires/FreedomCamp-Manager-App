# 📊 Historical Data Import Guide

## Excel File Structure
Your "Vehicle Log.xlsx" file has:
- **ID**: Record number (optional - 8884, 8883, 8882...)
- **Title**: Zone/Location name (Jacksons I, Champagn, Bendigo)
- **Recorded date**: Date in DD/MM/YYYY format (3/02/2026)
- **REGO**: Plate number (Fis5NO, Hsm82, Pip93, 922d6...)
- **Note**: Officer notes (optional - may be empty)
- **Attachments**: Number of attachments (optional - usually 0)

---

## 🚀 Import Process

### Step 1: Convert Excel to CSV

1. Open "Vehicle Log.xlsx" in Excel
2. **File → Save As → CSV (Comma delimited)**
3. Save as `vehicle-log.csv`

---

### Step 2: Convert CSV to JSON

Create a simple script or use online converter to transform CSV → JSON:

**Example Input (CSV):**
```csv
ID,Title,Recorded date,REGO,Note,Attachments
8884,Jacksons I,3/02/2026,Fis5NO,,0
8883,Jacksons I,3/02/2026,Hsm82,,0
8882,Jacksons I,3/02/2026,Pip93,,0
```

**Required Output (JSON):**
```json
{
  "records": [
    {
      "id": 8884,
      "title": "Jacksons I",
      "recordeddate": "3/02/2026",
      "rego": "Fis5NO",
      "note": "",
      "attachments": 0
    },
    {
      "id": 8883,
      "title": "Jacksons I",
      "recordeddate": "3/02/2026",
      "rego": "Hsm82",
      "note": "",
      "attachments": 0
    }
  ]
}
```

**Quick Python Script to Convert:**
```python
import csv
import json

# Read CSV
records = []
with open('vehicle-log.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        records.append({
            'id': int(row['ID']) if row.get('ID') else None,
            'title': row.get('Title', ''),
            'recordeddate': row.get('Recorded date', ''),
            'rego': row.get('REGO', ''),
            'note': row.get('Note', ''),
            'attachments': int(row.get('Attachments', 0)) if row.get('Attachments') else 0
        })

# Write JSON
with open('vehicle-log.json', 'w') as f:
    json.dump({'records': records}, f, indent=2)

print(f"Converted {len(records)} records")
```

---

### Step 3: Before Import - Create Missing Zones

The import function will fail if location names don't match existing zones. Check which zones you need:

**Run this SQL to see existing zones:**
```sql
SELECT id, name FROM zones WHERE is_active = true ORDER BY name;
```

**Create missing zones if needed:**
```sql
-- Example: Create zone for "Jacksons I"
INSERT INTO zones (
  organization_id,
  name,
  description,
  is_active,
  self_contained_required,
  nights_per_month,
  max_consecutive_nights
) VALUES (
  (SELECT id FROM organizations LIMIT 1),
  'Jacksons I',
  'Historical import zone',
  true,
  true,
  28,
  3
);

-- Repeat for "Champagn", "Bendigo", etc.
```

**Or batch create all zones:**
```sql
DO $$
DECLARE
  v_org_id uuid;
  location_names text[] := ARRAY['Jacksons I', 'Champagn', 'Bendigo'];
  location_name text;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE is_active = true LIMIT 1;
  
  FOREACH location_name IN ARRAY location_names
  LOOP
    -- Only insert if zone doesn't exist
    IF NOT EXISTS (SELECT 1 FROM zones WHERE name = location_name) THEN
      INSERT INTO zones (
        organization_id,
        name,
        description,
        is_active
      ) VALUES (
        v_org_id,
        location_name,
        'Historical import zone',
        true
      );
      RAISE NOTICE 'Created zone: %', location_name;
    ELSE
      RAISE NOTICE 'Zone already exists: %', location_name;
    END IF;
  END LOOP;
END $$;
```

---

### Step 4: Call Import Function

**Deploy the Edge Function:**
```bash
supabase functions deploy import-historical-data
```

**Call via API (using curl):**
```bash
curl -X POST 'https://xbfnlzmpumthnjmtqufp.supabase.co/functions/v1/import-historical-data' \
  -H 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d @vehicle-log.json
```

**Call via JavaScript:**
```javascript
const { data, error } = await supabase.functions.invoke('import-historical-data', {
  body: {
    records: [
      {
        id: 8884,
        title: "Jacksons I",
        recordeddate: "3/02/2026",
        rego: "Fis5NO",
        note: "",
        attachments: 0
      },
      // ... more records
    ]
  }
});

console.log('Import result:', data);
```

---

## 📊 Import Response

The function returns:
```json
{
  "success": true,
  "summary": {
    "total": 100,
    "successful": 95,
    "failed": 5,
    "errors": [
      {
        "record": 8880,
        "error": "Zone not found: Unknown Location",
        "plate": "ABC123"
      }
    ],
    "zonesNotFound": ["Unknown Location"]
  },
  "observations": [
    {
      "id": "uuid",
      "plate": "FIS5NO",
      "zone": "Jacksons I",
      "date": "2026-02-03T12:00:00.000Z"
    }
  ]
}
```

---

## 🔍 How Missing Data is Handled

| Field | Source | Default/Logic |
|-------|--------|---------------|
| **plate_number** | `REGO` column | Cleaned (uppercase, no special chars) |
| **recorded_at** | `Recorded date` | Parsed DD/MM/YYYY → ISO timestamp (noon) |
| **zone_id** | `Title` column → zones table | Fuzzy match by name |
| **organization_id** | Database | First active organization |
| **recorded_by** | Database | First admin/master user |
| **vehicle_make** | Not available | NULL (can be updated later) |
| **vehicle_model** | Not available | NULL |
| **vehicle_color** | Not available | NULL |
| **vehicle_year** | Not available | NULL |
| **self_contained** | Not available | FALSE (default) |
| **gps_latitude** | Not available | NULL |
| **gps_longitude** | Not available | NULL |
| **officer_notes** | `Note` column or generated | If Note empty: "Imported from historical data (ID: XXXX)", else: "[Note content] (Imported...)" |
| **photo** | Not available | NULL |

---

## ✅ Post-Import Verification

### Check imported observations:
```sql
SELECT 
  observation_id,
  plate_number,
  recorded_at,
  zone_id,
  officer_notes
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'
ORDER BY recorded_at DESC
LIMIT 10;
```

### Check import history:
```sql
SELECT 
  import_type,
  records_imported,
  failed_records,
  status,
  error_log,
  created_at
FROM import_history
WHERE import_type = 'historical_vehicle_log'
ORDER BY created_at DESC
LIMIT 1;
```

### Check canonical vehicles created:
```sql
SELECT 
  plate_number,
  first_seen_at,
  total_observations,
  vehicle_make,
  vehicle_model
FROM canonical_vehicles
WHERE plate_number IN ('FIS5NO', 'HSM82', 'PIP93', '922D6', 'QEY735')
ORDER BY plate_number;
```

### Check monthly stays:
```sql
SELECT 
  plate_number,
  zone_id,
  calendar_month,
  nights_stayed,
  consecutive_nights
FROM vehicle_monthly_stays
WHERE calendar_month = '2026-02-01'
ORDER BY plate_number
LIMIT 10;
```

---

## 🛠️ Troubleshooting

### Error: "Zone not found: [Location Name]"
**Solution:** Create the missing zone (see Step 3)

### Error: "Invalid date format"
**Solution:** Ensure dates are DD/MM/YYYY format. Check for:
- Leading zeros (3/02/2026 vs 03/02/2026)
- Correct separator (/ not -)
- Valid dates (no 32/13/2026)

### Error: "Invalid plate number"
**Solution:** Check `REGO` column for:
- Empty values
- Special characters only
- Very short values (<2 chars)

### Error: "No active organization found"
**Solution:** Ensure you have at least one active organization:
```sql
SELECT id, name, is_active FROM organizations;
```

If none exist, create one:
```sql
INSERT INTO organizations (name, is_active) 
VALUES ('Default Organization', true);
```

---

## 🎯 Batch Import Recommendations

### ⚠️ CRITICAL: For 8553 Records, MUST Use Batch Import!

**DO NOT import all 8553 records at once!** You will get:
- ❌ Edge Function timeout (>60 seconds limit)
- ❌ Database overload (8553 triggers firing)
- ❌ Memory exceeded
- ❌ Import failure

**Use the automated batch import script instead:**

### 🚀 Automated Batch Import (RECOMMENDED)

**Use `batch-import-script.js` for large imports:**

1. **Install Node.js** from https://nodejs.org
2. **Convert Excel to JSON** (see Step 1)
3. **Create missing zones** (see Step 3)
4. **Update script configuration:**
   ```javascript
   const SUPABASE_ANON_KEY = 'your_key_here'; // From Supabase Dashboard
   ```
5. **Run the script:**
   ```bash
   node batch-import-script.js
   ```

**The script automatically:**
- ✅ Splits 8553 records into 86 batches of 100
- ✅ Waits 2 seconds between batches
- ✅ Shows live progress
- ✅ Saves progress on errors
- ✅ Generates detailed error reports
- ✅ Completes in ~3-5 minutes

**See `BATCH_IMPORT_INSTRUCTIONS.md` for complete step-by-step guide.**

### Manual Batch Import (For Developers)

If you prefer to code your own batch import:

```javascript
// Split records into chunks
const BATCH_SIZE = 100;
for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE);
  
  console.log(`Importing batch ${Math.floor(i/BATCH_SIZE) + 1}...`);
  
  const { data, error } = await supabase.functions.invoke('import-historical-data', {
    body: { records: batch }
  });
  
  if (error) {
    console.error('Batch failed:', error);
    break;
  }
  
  console.log(`Batch complete: ${data.summary.successful}/${data.summary.total} successful`);
  
  // Wait 2 seconds between batches
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

---

## 📝 Next Steps After Import

1. **Review imported data** in admin portal
2. **Update vehicle details** (make/model/color) where available
3. **Add photos** to historical observations if you have them
4. **Verify compliance results** were calculated correctly
5. **Check for duplicate plates** across different zones

```sql
-- Find vehicles with most observations
SELECT 
  plate_number,
  COUNT(*) as observation_count,
  MIN(recorded_at) as first_seen,
  MAX(recorded_at) as last_seen
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'
GROUP BY plate_number
ORDER BY observation_count DESC
LIMIT 20;
```
