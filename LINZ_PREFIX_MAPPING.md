# 🗺️ LINZ Prefix Mapping Guide

## Zone Name Format

Your historical Excel file uses **LINZ prefixed names** in the Title column:
- `LINZ - Jacksons Inlet`
- `LINZ - Champagne Gully`
- `LINZ - Bendigo`
- `LINZ - Lowburn`

But your Supabase `zones` table stores the **actual zone names WITHOUT the prefix**:
- `Jacksons Inlet`
- `Champagne Gully`
- `Bendigo`
- `Lowburn`

---

## How the Import Handles This

The `import-historical-data` Edge Function **automatically strips the LINZ prefix** before matching zones:

```typescript
// In findZoneId() function:
normalized = normalized.replace(/^linz\s*-\s*/i, '');

// Examples:
"LINZ - Jacksons Inlet"  → "jacksons inlet"  → matches zone "Jacksons Inlet"
"LINZ-Champagne Gully"   → "champagne gully" → matches zone "Champagne Gully"
"LINZ  -  Bendigo"       → "bendigo"         → matches zone "Bendigo"
"Lowburn"                → "lowburn"         → matches zone "Lowburn"
```

**Supported variations:**
- `LINZ - [Name]` (standard format)
- `LINZ-[Name]` (no space before dash)
- `LINZ -[Name]` (no space after dash)
- `LINZ  -  [Name]` (multiple spaces)
- `linz - [Name]` (case insensitive)
- `[Name]` (no prefix - works too!)

---

## Zone Creation SQL

Create zones in Supabase **WITHOUT the LINZ prefix**:

```sql
DO $$
DECLARE
  v_org_id uuid;
  zone_names text[] := ARRAY[
    'Jacksons Inlet',
    'Champagne Gully',
    'Bendigo',
    'Lowburn'
    -- Add all other zone names WITHOUT LINZ prefix
  ];
  zone_name text;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE is_active = true LIMIT 1;
  
  FOREACH zone_name IN ARRAY zone_names
  LOOP
    IF NOT EXISTS (SELECT 1 FROM zones WHERE name = zone_name) THEN
      INSERT INTO zones (
        organization_id,
        name,
        description,
        is_active
      ) VALUES (
        v_org_id,
        zone_name,
        'Freedom camping zone',
        true
      );
      RAISE NOTICE 'Created zone: %', zone_name;
    END IF;
  END LOOP;
END $$;
```

---

## Mapping Table

| Excel Title Column | Zone Name in Database | Match Result |
|-------------------|----------------------|--------------|
| `LINZ - Jacksons Inlet` | `Jacksons Inlet` | ✅ Match |
| `LINZ - Champagne Gully` | `Champagne Gully` | ✅ Match |
| `LINZ - Bendigo` | `Bendigo` | ✅ Match |
| `LINZ - Lowburn` | `Lowburn` | ✅ Match |
| `LINZ-Kawarau` | `Kawarau` | ✅ Match |
| `Wanaka` | `Wanaka` | ✅ Match (no prefix needed) |

---

## Extract Unique Zone Names from Excel

To get all unique zone names from your Excel file:

### Option 1: Using Excel
1. Open `Vehicle Log.xlsx`
2. Select Title column
3. **Data → Remove Duplicates**
4. Copy unique values to a new sheet
5. Manually remove "LINZ - " prefix from each

### Option 2: Using Python
```python
import pandas as pd

# Read Excel file
df = pd.read_excel('Vehicle Log.xlsx')

# Get unique titles
unique_titles = df['Title'].unique()

# Strip LINZ prefix
zone_names = []
for title in unique_titles:
    # Remove LINZ prefix
    cleaned = str(title).replace('LINZ - ', '').replace('LINZ-', '').strip()
    if cleaned and cleaned != 'nan':
        zone_names.append(cleaned)

# Sort and print
zone_names = sorted(set(zone_names))
for name in zone_names:
    print(f"  '{name}',")
```

This outputs:
```
  'Bendigo',
  'Champagne Gully',
  'Jacksons Inlet',
  'Lowburn',
  ...
```

Use this list in the zone creation SQL above.

---

## Verification After Import

Check that LINZ prefixes were stripped correctly:

```sql
-- Should show zone names WITHOUT LINZ prefix
SELECT DISTINCT
  z.name as zone_name,
  COUNT(v.observation_id) as observation_count
FROM vehicle_observations_v2 v
JOIN zones z ON z.id = v.zone_id
WHERE v.officer_notes LIKE '%Imported from historical%'
GROUP BY z.name
ORDER BY z.name;
```

**Expected output:**
```
zone_name          | observation_count
-------------------|------------------
Bendigo            | 523
Champagne Gully    | 1247
Jacksons Inlet     | 892
Lowburn            | 315
```

**NOT:**
```
LINZ - Bendigo     | 523  ❌ Wrong!
```

---

## Troubleshooting

### Error: "Zone not found: LINZ - Jacksons Inlet"

**Cause:** Zone doesn't exist in database

**Solution:** Create the zone WITHOUT the prefix:
```sql
INSERT INTO zones (organization_id, name, is_active)
VALUES (
  (SELECT id FROM organizations LIMIT 1),
  'Jacksons Inlet',  -- ✅ No LINZ prefix
  true
);
```

### Error: "Zone not found: jacksons inlet"

**Cause:** Zone name doesn't match exactly

**Check database for similar names:**
```sql
SELECT name FROM zones 
WHERE LOWER(name) LIKE '%jackson%';
```

Might return:
- `Jacksons Inlet` ✅
- `Jackson's Inlet` (with apostrophe)
- `Jacksons I` (abbreviated)

**Solution:** Update zone name to match, or update Edge Function fuzzy matching logic.

---

## Summary

✅ **Excel file:** Contains `LINZ - [Zone Name]` in Title column  
✅ **Database:** Contains just `[Zone Name]` in zones table  
✅ **Import function:** Automatically strips `LINZ - ` prefix before matching  
✅ **No manual editing needed:** The import handles prefix stripping automatically  

**You just need to ensure zones exist in database with the correct names (without LINZ prefix).**
