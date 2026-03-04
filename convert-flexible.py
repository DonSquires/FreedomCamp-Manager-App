"""
FLEXIBLE EXCEL TO JSON CONVERTER
Automatically detects column names and maps to import format
"""

import csv
import json
import sys

def find_column(headers, *possible_names):
    """Find column by checking multiple possible names (case-insensitive)"""
    headers_lower = [h.lower().strip() for h in headers]
    
    for name in possible_names:
        name_lower = name.lower().strip()
        if name_lower in headers_lower:
            return headers[headers_lower.index(name_lower)]
    
    # Try partial match
    for name in possible_names:
        name_lower = name.lower().strip()
        for header in headers:
            if name_lower in header.lower():
                return header
    
    return None

def convert_excel_to_json(csv_file, json_file):
    """Convert Excel CSV to JSON format for import"""
    
    records = []
    skipped = 0
    
    with open(csv_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        
        print("📋 Detected columns:")
        for i, header in enumerate(headers, 1):
            print(f"   {i}. '{header}'")
        print()
        
        # Auto-detect column names
        id_col = find_column(headers, 'ID', 'id', 'record_id')
        title_col = find_column(headers, 'Title', 'title', 'location', 'zone', 'site')
        date_col = find_column(headers, 'Recorded date', 'RecordedDate', 'Recorded', 'Date', 'date')
        rego_col = find_column(headers, 'REGO', 'rego', 'Plate', 'plate', 'registration', 'plate_number')
        note_col = find_column(headers, 'Note', 'note', 'notes', 'comments')
        attach_col = find_column(headers, 'Attachments', 'attachments', 'Attachmen', 'files')
        
        print("🔍 Column mapping:")
        print(f"   ID: {id_col or 'NOT FOUND'}")
        print(f"   Title (zone): {title_col or 'NOT FOUND ❌'}")
        print(f"   Date: {date_col or 'NOT FOUND ❌'}")
        print(f"   REGO (plate): {rego_col or 'NOT FOUND ❌'}")
        print(f"   Note: {note_col or 'NOT FOUND'}")
        print(f"   Attachments: {attach_col or 'NOT FOUND'}")
        print()
        
        # Validate required columns
        if not title_col:
            print("❌ ERROR: Could not find Title/Zone column")
            print(f"   Available columns: {', '.join(headers)}")
            sys.exit(1)
        
        if not date_col:
            print("❌ ERROR: Could not find Date column")
            print(f"   Available columns: {', '.join(headers)}")
            sys.exit(1)
        
        if not rego_col:
            print("❌ ERROR: Could not find REGO/Plate column")
            print(f"   Available columns: {', '.join(headers)}")
            sys.exit(1)
        
        # Process rows
        for row_num, row in enumerate(reader, start=2):  # start=2 because row 1 is headers
            try:
                # Get values with fallbacks
                record_id = row.get(id_col, '') if id_col else ''
                title = row.get(title_col, '') if title_col else ''
                date = row.get(date_col, '') if date_col else ''
                rego = row.get(rego_col, '') if rego_col else ''
                note = row.get(note_col, '') if note_col else ''
                attachments = row.get(attach_col, '0') if attach_col else '0'
                
                # Skip completely empty rows
                if not any([record_id, title, date, rego, note]):
                    skipped += 1
                    continue
                
                # Create record
                record = {
                    'id': int(record_id) if record_id and record_id.strip().isdigit() else None,
                    'title': title.strip() if title else '',
                    'recordeddate': date.strip() if date else '',
                    'rego': rego.strip() if rego else '',
                    'note': note.strip() if note else '',
                    'attachments': int(attachments) if attachments and attachments.strip().isdigit() else 0
                }
                
                records.append(record)
                
            except Exception as e:
                print(f"⚠️ Warning: Error processing row {row_num}: {e}")
                continue
    
    # Write JSON
    output = {'records': records}
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Conversion complete!")
    print(f"   - Total records: {len(records)}")
    print(f"   - Skipped (empty): {skipped}")
    print(f"   - Output file: {json_file}")
    print()
    print("📄 First record preview:")
    if records:
        print(json.dumps(records[0], indent=2))

if __name__ == '__main__':
    print("🔄 FLEXIBLE EXCEL TO JSON CONVERTER\n")
    
    csv_file = 'vehicle-log.csv'
    json_file = 'vehicle-log.json'
    
    try:
        convert_excel_to_json(csv_file, json_file)
    except FileNotFoundError:
        print(f"❌ ERROR: File '{csv_file}' not found")
        print()
        print("📝 Steps:")
        print("1. Open Vehicle Log.xlsx in Excel")
        print("2. File → Save As → CSV (Comma delimited)")
        print("3. Save as 'vehicle-log.csv' in this folder")
        print("4. Run this script again")
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
