# 📊 Direct Excel (.xlsx) Import Guide

## Overview

Import your Vehicle Log.xlsx file **directly** without manual CSV conversion!

---

## ✅ Quick Start (3 Steps)

### Step 1: Install Dependencies
```bash
npm install xlsx
```

### Step 2: Configure Script
Edit `import-xlsx-direct.js`:
```javascript
const SUPABASE_ANON_KEY = 'your_actual_anon_key_here'; // Line 20
const EXCEL_FILE = 'Vehicle Log.xlsx'; // Line 21 (or your filename)
```

### Step 3: Run Import
```bash
node import-xlsx-direct.js
```

**That's it!** The script will:
1. Read your Excel file directly
2. Convert rows to proper format
3. Import in batches (100 records at a time)
4. Show progress and results

---

## 📋 Supported Excel Formats

### Column Names (Auto-Detected)

The script automatically detects these column name variations:

| Data | Supported Column Names |
|------|------------------------|
| **ID** | `ID`, `id` |
| **Zone** | `Title`, `title`, `Zone`, `zone` |
| **Date** | `RecordedDate`, `Recorded Date`, `recordeddate`, `Date`, `date` |
| **Plate** | `REGO`, `rego`, `Plate`, `plate` |
| **Notes** | `Note`, `note`, `Notes`, `notes` |
| **Attachments** | `Attachments`, `attachments` |

**Your test data format is fully supported!** ✅

### Date Formats Supported

The Edge Function now handles **both** formats:

| Format | Example | Supported |
|--------|---------|-----------|
| **YYYY-MM-DD** | `2026-02-01` | ✅ (Your format) |
| **DD/MM/YYYY** | `3/02/2026` | ✅ (Old format) |
| **MM/DD/YYYY** | `2/3/2026` | ✅ (US format) |

**All parsed to noon UTC to avoid timezone issues.**

### Handling Empty/Missing Values

| Value in Excel | How It's Handled |
|----------------|------------------|
| Empty cell | Treated as `""` (empty string) |
| `NaN` | Converted to `""` (empty string) |
| `null` | Converted to `""` (empty string) |
| `0` (for attachments) | Kept as `0` |

**The script automatically filters out "NaN" strings from pandas/Excel exports!** ✅

---

## 📊 Example: Your Test Data

### Excel File
```
| ID   | Title            | RecordedDate | REGO   | Note                      | Attachments |
|------|------------------|--------------|--------|---------------------------|-------------|
| 8526 | Bendigo          | 2026-02-01   | Mzk802 | Parked in boat ramp area  | 1           |
| 8512 | Lowburn          | 2026-02-01   | Emp868 | NaN                       | 0           |
| 8511 | Lowburn          | 2026-02-01   | 425j9  | NaN                       | 0           |
| 8442 | Jacksons Inlet   | 2026-01-31   | Hsm82  | NaN                       | 0           |
```

### Converted to Import Format
```json
[
  {
    "id": 8526,
    "title": "Bendigo",
    "recordeddate": "2026-02-01",
    "rego": "Mzk802",
    "note": "Parked in boat ramp area",
    "attachments": 1
  },
  {
    "id": 8512,
    "title": "Lowburn",
    "recordeddate": "2026-02-01",
    "rego": "Emp868",
    "note": "",  // ✅ NaN converted to empty string
    "attachments": 0
  },
  // ... etc
]
```

### Imported to Database
```sql
-- Observation for 8526
plate_number: 'MZK802'  -- ✅ Cleaned (uppercase)
recorded_at: '2026-02-01T12:00:00.000Z'  -- ✅ Noon UTC
zone_id: [Bendigo zone UUID]
officer_notes: 'Parked in boat ramp area (Imported from historical data ID: 8526)'

-- Observation for 8512
plate_number: 'EMP868'
recorded_at: '2026-02-01T12:00:00.000Z'
zone_id: [Lowburn zone UUID]
officer_notes: 'Imported from historical data (ID: 8512)'  -- ✅ No "NaN"
```

---

## 🔧 What Gets Cleaned Automatically

### 1. Plate Numbers
- Uppercase conversion: `Mzk802` → `MZK802`
- Remove spaces: `ABC 123` → `ABC123`
- Remove special chars: `ABC-123` → `ABC123`

### 2. Zone Names
- **NO LINZ prefix stripping** (your data doesn't have it)
- Trimmed whitespace
- Direct matching to zones table

### 3. Notes
- **"NaN" strings removed**: `NaN` → `""` (empty)
- Trimmed whitespace
- Preserved custom notes: `"Parked in boat ramp area"` → kept exactly

### 4. Dates
- **YYYY-MM-DD**: `2026-02-01` → `2026-02-01T12:00:00.000Z`
- **DD/MM/YYYY**: `1/02/2026` → `2026-02-01T12:00:00.000Z`
- All converted to noon UTC

---

## 🚀 Running the Import

### Full Command Sequence

```bash
# 1. Install dependencies (first time only)
npm install xlsx

# 2. Update configuration
# Edit import-xlsx-direct.js and set:
#   - SUPABASE_ANON_KEY
#   - EXCEL_FILE

# 3. Run import
node import-xlsx-direct.js

# Expected output:
# 📖 Reading Excel file: Vehicle Log.xlsx
# ✅ Found 8553 rows in Excel
# ✅ Converted 8553 valid records
# 
# 📄 Sample record (first):
# {
#   "id": 8526,
#   "title": "Bendigo",
#   "recordeddate": "2026-02-01",
#   "rego": "Mzk802",
#   "note": "Parked in boat ramp area",
#   "attachments": 1
# }
#
# 📊 Import Summary:
#    - Total records: 8553
#    - Batch size: 100
#    - Total batches: 86
#    - Estimated time: ~172 seconds
#
# Continue with import? (yes/no): yes
#
# 🔄 Starting batch import...
# 📦 Batch 1/86 - Importing 100 records...
# ✅ Batch 1 complete:
#    - Successful: 100
#    - Failed: 0
# ⏳ Waiting 2s before next batch...
# ...
```

---

## ⚠️ Before Importing: Create Zones

Your test data references these zones:
- Bendigo
- Lowburn
- Jacksons Inlet
- Champagne Gully

**Ensure they exist in your zones table:**

```sql
DO $$
DECLARE
  v_org_id uuid;
  zone_names text[] := ARRAY[
    'Bendigo',
    'Lowburn',
    'Jacksons Inlet',
    'Champagne Gully'
    -- Add all other zones from your Excel file
  ];
  zone_name text;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE is_active = true LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found!';
  END IF;
  
  FOREACH zone_name IN ARRAY zone_names
  LOOP
    INSERT INTO zones (organization_id, name, is_active)
    VALUES (v_org_id, zone_name, true)
    ON CONFLICT (organization_id, name) DO NOTHING;
  END LOOP;
  
  RAISE NOTICE 'Zones created/verified';
END $$;
```

**Extract unique zone names from Excel:**

```javascript
// Quick script to get unique zones
const XLSX = require('xlsx');
const workbook = XLSX.readFile('Vehicle Log.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);
const zones = [...new Set(data.map(row => row.Title))].sort();
console.log(zones.map(z => `  '${z}',`).join('\n'));
```

---

## 📊 Verification After Import

### Check imported observations
```sql
SELECT 
  observation_id,
  plate_number,
  recorded_at::date as date,
  officer_notes,
  z.name as zone
FROM vehicle_observations_v2 v
JOIN zones z ON z.id = v.zone_id
WHERE v.officer_notes LIKE '%Imported from historical%'
ORDER BY v.recorded_at DESC
LIMIT 10;
```

### Check for NaN handling
```sql
-- Should return 0 rows (all NaN values removed)
SELECT COUNT(*) 
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%NaN%';
```

### Check date parsing
```sql
SELECT 
  recorded_at::date as observation_date,
  COUNT(*) as count
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'
GROUP BY recorded_at::date
ORDER BY observation_date DESC;
```

### Check plate cleaning
```sql
-- All should be uppercase, no spaces/special chars
SELECT DISTINCT plate_number
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'
ORDER BY plate_number
LIMIT 20;
```

---

## 🔍 Troubleshooting

### Error: "xlsx library not installed"
```bash
npm install xlsx
```

### Error: "Cannot find module 'xlsx'"
```bash
# Install in the same directory as import-xlsx-direct.js
npm install xlsx
```

### Error: "Zone not found: [Zone Name]"
**Solution:** Create the zone in Supabase (see SQL above)

### Warning: "NaN values detected"
**Not a problem!** The script automatically converts `"NaN"` to empty strings.

### Date not parsing correctly
**Check your Excel date format:**
- Should be `YYYY-MM-DD` (e.g., `2026-02-01`)
- Or `DD/MM/YYYY` (e.g., `1/02/2026`)
- NOT just a number (Excel serial date)

If Excel shows dates as numbers (e.g., `44954`), format the column:
1. Select date column
2. Right-click → Format Cells
3. Choose "Date" → `YYYY-MM-DD`

---

## 📝 Summary of Improvements

### What's Different from Previous Guides

| Feature | Old Method | New Method |
|---------|------------|------------|
| **File Format** | Manual CSV conversion | ✅ Direct .xlsx reading |
| **Date Format** | Only DD/MM/YYYY | ✅ YYYY-MM-DD + DD/MM/YYYY |
| **NaN Values** | Not handled | ✅ Auto-removed |
| **LINZ Prefix** | Auto-stripped | ✅ Not needed (no prefix) |
| **Steps** | 3-step (export CSV, convert, import) | ✅ 1-step (import directly) |

### Key Advantages

✅ **No manual CSV export** - Read Excel files directly  
✅ **Flexible date parsing** - Handles YYYY-MM-DD and DD/MM/YYYY  
✅ **NaN cleanup** - Automatically removes "NaN" strings  
✅ **Auto column detection** - Finds columns even with different names  
✅ **Same batch import** - Same reliable batch logic, just simpler  

---

## 🎯 Ready to Import!

**Your test data format is fully supported with zero manual conversion needed!**

```bash
# Just run this command:
node import-xlsx-direct.js
```

All 8553 records will be imported with:
- ✅ Dates parsed correctly (YYYY-MM-DD → noon UTC)
- ✅ Plate numbers cleaned (MZK802, EMP868, etc.)
- ✅ NaN values removed (no "NaN" in notes)
- ✅ Custom notes preserved ("Parked in boat ramp area")
- ✅ Zones matched directly (no LINZ prefix)
- ✅ Batched import (100 records per batch)

**Total time: ~3-5 minutes for 8553 records** ⚡
