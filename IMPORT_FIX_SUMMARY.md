# 🔧 Import Function Fix - Corrected Column Mappings

## What Was Wrong

The Edge Function was reading the wrong columns from your Excel file:

| Column | I Thought It Was | Actually Is |
|--------|------------------|-------------|
| **ID** | Required ID number | Optional unique ID |
| **Title** | Zone name | ✅ Zone name (CORRECT) |
| **Recorded date** | Missing! | **Date** (DD/MM/YYYY) |
| **REGO** | Missing! | **Plate number** |
| **Note** | Plate number ❌ | Officer notes (optional) |
| **Attachments** | Required | Optional (usually 0) |

**The Error**: I was trying to read plate numbers from the `note` column instead of the `rego` column, causing "can't read properties" errors.

---

## ✅ What I Fixed

### 1. **Corrected TypeScript Interface**

**Before:**
```typescript
interface HistoricalRecord {
  id: number;
  title: string;
  recordedEREGO: string; // ❌ Wrong name
  note: string;          // ❌ Thought this was plate number
  attachments: number;
}
```

**After:**
```typescript
interface HistoricalRecord {
  id?: number;           // ✅ Optional
  title?: string;        // ✅ Zone name
  recordeddate?: string; // ✅ Date (correct name)
  rego?: string;         // ✅ Plate number (correct column!)
  note?: string;         // ✅ Officer notes (optional)
  attachments?: number;  // ✅ Optional
}
```

### 2. **Updated Plate Number Reading**

**Before:**
```typescript
const plateNumber = cleanPlateNumber(record.note); // ❌ Wrong column!
```

**After:**
```typescript
const plateNumber = cleanPlateNumber(record.rego || ''); // ✅ Correct column!
```

### 3. **Updated Date Reading**

**Before:**
```typescript
const recordedDate = parseDate(record.recordedEREGO); // ❌ Wrong name
```

**After:**
```typescript
const recordedDate = parseDate(record.recordeddate || ''); // ✅ Correct name
```

### 4. **Added Missing Data Handling**

All fields are now optional with fallbacks:

```typescript
// Zone name fallback
const locationName = (record.title || 'unknown').trim();

// Officer notes fallback
const officerNotes = record.note 
  ? `${record.note} (Imported from historical data ID: ${record.id || 'unknown'})`
  : `Imported from historical data (ID: ${record.id || 'unknown'})`;

// ID fallback
record: record.id || 0
```

---

## 📊 Excel to JSON Mapping

### Your Excel Structure
```
| ID   | Title                    | Recorded date | REGO   | Note | Attachments |
|------|--------------------------|---------------|--------|------|-------------|
| 8884 | LINZ - Jacksons Inlet    | 3/02/2026     | Fis5NO |      | 0           |
| 8883 | LINZ - Champagne Gully   | 3/02/2026     | Hsm82  |      | 0           |
```

**Important:** The Title column contains "LINZ - " prefix which is automatically stripped during import.

### Required JSON Format
```json
{
  "records": [
    {
      "id": 8884,
      "title": "LINZ - Jacksons Inlet",
      "recordeddate": "3/02/2026",
      "rego": "Fis5NO",
      "note": "",
      "attachments": 0
    },
    {
      "id": 8883,
      "title": "LINZ - Champagne Gully",
      "recordeddate": "3/02/2026",
      "rego": "Hsm82",
      "note": "",
      "attachments": 0
    }
  ]
}
```

---

## 🔄 Updated Python Conversion Script

Save this as `convert.py`:

```python
import csv
import json

# Read CSV (exported from Excel)
records = []
with open('vehicle-log.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Handle missing/optional fields
        record = {
            'id': int(row['ID']) if row.get('ID') and row['ID'].strip() else None,
            'title': row.get('Title', '').strip(),
            'recordeddate': row.get('Recorded date', '').strip(),
            'rego': row.get('REGO', '').strip(),
            'note': row.get('Note', '').strip(),
            'attachments': int(row['Attachments']) if row.get('Attachments') and row['Attachments'].strip() else 0
        }
        records.append(record)

# Write JSON
with open('vehicle-log.json', 'w') as f:
    json.dump({'records': records}, f, indent=2)

print(f"✅ Converted {len(records)} records")
print(f"First record: {records[0]}")
```

Run with:
```bash
python convert.py
```

---

## 🚀 How to Use

### Step 1: Export Excel to CSV
1. Open `Vehicle Log.xlsx`
2. **File → Save As → CSV (Comma delimited)**
3. Save as `vehicle-log.csv`

### Step 2: Convert CSV to JSON
```bash
python convert.py
```

This creates `vehicle-log.json` with correct structure.

### Step 3: Deploy Edge Function
```bash
supabase functions deploy import-historical-data
```

### Step 4: Run Batch Import
```bash
node batch-import-script.js
```

---

## 🔍 What Happens During Import

For each record:

1. **Read plate number from REGO column** (not Note!)
   - Clean: uppercase, remove spaces/special chars
   - Example: `Fis5NO` → `FIS5NO`

2. **Read date from Recorded date column**
   - Parse DD/MM/YYYY format
   - Convert to ISO timestamp (noon)
   - Example: `3/02/2026` → `2026-02-03T12:00:00.000Z`

3. **Read zone from Title column**
   - **Strip "LINZ - " prefix automatically**
   - Match to existing zone in database
   - Fuzzy matching supported
   - Example: `LINZ - Jacksons Inlet` → strips to `Jacksons Inlet` → zone ID
   
   **Supported LINZ prefix variations:**
   - `LINZ - Jacksons Inlet` → `Jacksons Inlet`
   - `LINZ-Jacksons Inlet` → `Jacksons Inlet`
   - `LINZ -Jacksons Inlet` → `Jacksons Inlet`
   - `LINZ  -  Jacksons Inlet` → `Jacksons Inlet`

4. **Read officer notes from Note column** (NEW!)
   - If empty: `"Imported from historical data (ID: 8884)"`
   - If has value: `"[note content] (Imported from historical data ID: 8884)"`

5. **Fill missing data with defaults**
   - Organization: First active org
   - Recorded by: First admin user
   - Vehicle details: NULL (unknown)
   - Self-contained: FALSE

---

## 📋 Missing Data Logic

| Field | If Empty | Default Value |
|-------|----------|---------------|
| **ID** | No ID | Use 0 |
| **Title** | No zone | Use "unknown" (after stripping LINZ prefix) |
| **Recorded date** | No date | Skip record (required) |
| **REGO** | No plate | Skip record (required) |
| **Note** | No notes | "Imported from historical data (ID: X)" |
| **Attachments** | No count | Use 0 |

**Zone Name Processing:**
1. Read Title column value (e.g., "LINZ - Jacksons Inlet")
2. Strip "LINZ - " prefix → "Jacksons Inlet"
3. Match to zones table where name = "Jacksons Inlet"
4. If no match found, record fails with "Zone not found" error

---

## ✅ Verification

After import, check the data:

### Check observations created
```sql
SELECT 
  observation_id,
  plate_number,
  recorded_at,
  officer_notes,
  zone_id
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'
ORDER BY recorded_at DESC
LIMIT 10;
```

### Check officer notes preserved
```sql
SELECT 
  plate_number,
  officer_notes
FROM vehicle_observations_v2
WHERE officer_notes LIKE '%Imported from historical%'
  AND officer_notes NOT LIKE 'Imported from historical data (ID:%'
LIMIT 5;
```

This query finds records where the original `Note` column had content.

---

## 🎯 Summary

**Fixed Issues:**
- ✅ Plate numbers now read from `REGO` column (not `Note`)
- ✅ Date now read from `Recorded date` column (not `recordedEREGO`)
- ✅ Officer notes preserved from `Note` column
- ✅ All fields now optional with fallback values
- ✅ "Can't read properties" error eliminated

**Ready to import your 8553 records!** 🚀
