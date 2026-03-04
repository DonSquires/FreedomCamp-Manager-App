/**
 * DIRECT EXCEL (.XLSX) IMPORT SCRIPT
 * 
 * Reads Excel files directly and imports to Supabase in batches
 * No manual CSV conversion needed!
 * 
 * REQUIREMENTS:
 * npm install xlsx
 * 
 * USAGE:
 * node import-xlsx-direct.js
 */

const XLSX = require('xlsx');
const https = require('https');
const fs = require('fs');

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================
const SUPABASE_URL = 'https://xbfnlzmpumthnjmtqufp.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Get from Supabase Dashboard
const EXCEL_FILE = 'Vehicle Log.xlsx'; // Your Excel file
const BATCH_SIZE = 100; // Records per batch
const DELAY_MS = 2000; // Delay between batches

// ============================================
// EXCEL READING & CONVERSION
// ============================================

function cleanValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    // Handle "NaN" string from Excel/pandas
    if (value.toLowerCase() === 'nan') return '';
    return value.trim();
  }
  return String(value);
}

function excelDateToJSDate(excelDate) {
  // Excel stores dates as numbers (days since 1900-01-01)
  if (typeof excelDate === 'number') {
    const date = new Date((excelDate - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD
  }
  return excelDate;
}

function readExcelFile(filename) {
  console.log(`📖 Reading Excel file: ${filename}\n`);
  
  try {
    // Read Excel file
    const workbook = XLSX.readFile(filename);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet, { 
      defval: '',
      raw: false // Get formatted values
    });
    
    console.log(`✅ Found ${rawData.length} rows in Excel\n`);
    
    // Convert to import format
    const records = rawData.map((row, index) => {
      try {
        // Handle different possible column names
        const id = row['ID'] || row['id'] || null;
        const title = cleanValue(row['Title'] || row['title'] || row['Zone'] || row['zone']);
        const recordedDate = cleanValue(
          row['RecordedDate'] || 
          row['Recorded Date'] || 
          row['Recorded date'] || 
          row['recordeddate'] ||
          row['Date'] ||
          row['date']
        );
        const rego = cleanValue(
          row['REGO'] || 
          row['rego'] || 
          row['Plate'] || 
          row['plate']
        );
        const note = cleanValue(row['Note'] || row['note'] || row['Notes'] || row['notes']);
        const attachments = row['Attachments'] || row['attachments'] || 0;
        
        // Skip completely empty rows
        if (!title && !recordedDate && !rego) {
          return null;
        }
        
        return {
          id: id ? parseInt(id) : null,
          title: title,
          recordeddate: recordedDate,
          rego: rego,
          note: note,
          attachments: attachments ? parseInt(attachments) : 0
        };
      } catch (error) {
        console.warn(`⚠️ Warning: Error processing row ${index + 2}:`, error.message);
        return null;
      }
    }).filter(record => record !== null);
    
    console.log(`✅ Converted ${records.length} valid records\n`);
    
    // Show sample
    if (records.length > 0) {
      console.log('📄 Sample record (first):');
      console.log(JSON.stringify(records[0], null, 2));
      console.log();
    }
    
    return records;
  } catch (error) {
    console.error(`❌ Error reading Excel file:`, error.message);
    throw error;
  }
}

// ============================================
// BATCH IMPORT LOGIC (same as batch-import-script.js)
// ============================================

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function importBatch(records, batchNumber, totalBatches) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ records });
    
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

    console.log(`📦 Batch ${batchNumber}/${totalBatches} - Importing ${records.length} records...`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (res.statusCode === 200) {
            console.log(`✅ Batch ${batchNumber} complete:`);
            console.log(`   - Successful: ${result.summary.successful}`);
            console.log(`   - Failed: ${result.summary.failed}`);
            
            if (result.summary.errors && result.summary.errors.length > 0) {
              console.log(`   ⚠️ Errors:`, result.summary.errors.slice(0, 3));
            }
            
            resolve(result);
          } else {
            console.error(`❌ Batch ${batchNumber} failed (HTTP ${res.statusCode})`);
            console.error(data);
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (error) {
          console.error(`❌ Batch ${batchNumber} parse error:`, error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Batch ${batchNumber} request error:`, error);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('🚀 DIRECT EXCEL IMPORT TO SUPABASE');
  console.log('====================================\n');

  // Validate configuration
  if (SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    console.error('❌ ERROR: Please update SUPABASE_ANON_KEY in the script');
    process.exit(1);
  }

  // Check if xlsx library is installed
  try {
    require.resolve('xlsx');
  } catch (error) {
    console.error('❌ ERROR: xlsx library not installed');
    console.log('\n📦 Install it with: npm install xlsx\n');
    process.exit(1);
  }

  // Read Excel file
  const allRecords = readExcelFile(EXCEL_FILE);
  
  if (allRecords.length === 0) {
    console.error('❌ No records found in Excel file');
    process.exit(1);
  }

  const totalRecords = allRecords.length;
  const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);

  console.log(`📊 Import Summary:`);
  console.log(`   - Total records: ${totalRecords}`);
  console.log(`   - Batch size: ${BATCH_SIZE}`);
  console.log(`   - Total batches: ${totalBatches}`);
  console.log(`   - Estimated time: ~${Math.ceil(totalBatches * (DELAY_MS / 1000))} seconds\n`);

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    readline.question('Continue with import? (yes/no): ', resolve);
  });
  readline.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ Import cancelled');
    process.exit(0);
  }

  console.log('\n🔄 Starting batch import...\n');

  const results = {
    totalProcessed: 0,
    totalSuccessful: 0,
    totalFailed: 0,
    errors: [],
    zonesNotFound: new Set()
  };

  const startTime = Date.now();

  // Process batches
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const batch = allRecords.slice(i, i + BATCH_SIZE);

    try {
      const result = await importBatch(batch, batchNumber, totalBatches);
      
      results.totalProcessed += result.summary.total;
      results.totalSuccessful += result.summary.successful;
      results.totalFailed += result.summary.failed;
      results.errors.push(...result.summary.errors);
      
      if (result.summary.zonesNotFound) {
        result.summary.zonesNotFound.forEach(z => results.zonesNotFound.add(z));
      }

      // Wait between batches (except on last batch)
      if (i + BATCH_SIZE < allRecords.length) {
        console.log(`⏳ Waiting ${DELAY_MS / 1000}s before next batch...`);
        await delay(DELAY_MS);
      }
    } catch (error) {
      console.error(`\n❌ CRITICAL ERROR on batch ${batchNumber}:`, error.message);
      console.log('\n⚠️ Import paused. Fix the error and restart from batch', batchNumber);
      
      // Save progress
      const progressFile = `import-progress-${Date.now()}.json`;
      fs.writeFileSync(progressFile, JSON.stringify({
        lastCompletedBatch: batchNumber - 1,
        remainingRecords: allRecords.slice(i),
        results
      }, null, 2));
      
      console.log(`📝 Progress saved to: ${progressFile}`);
      process.exit(1);
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log('\n\n====================================');
  console.log('✅ IMPORT COMPLETE!');
  console.log('====================================\n');
  console.log(`📊 Final Results:`);
  console.log(`   - Total processed: ${results.totalProcessed}`);
  console.log(`   - Successful: ${results.totalSuccessful} ✅`);
  console.log(`   - Failed: ${results.totalFailed} ❌`);
  console.log(`   - Duration: ${duration}s`);

  if (results.zonesNotFound.size > 0) {
    console.log(`\n⚠️ Zones not found (${results.zonesNotFound.size}):`);
    Array.from(results.zonesNotFound).forEach(z => console.log(`   - ${z}`));
    console.log('\n💡 Create these zones in Supabase, then re-import failed records');
  }

  if (results.errors.length > 0) {
    console.log(`\n❌ Errors (first 10):`);
    results.errors.slice(0, 10).forEach(err => {
      console.log(`   - Record ${err.record}: ${err.error}`);
    });
    
    const errorFile = `import-errors-${Date.now()}.json`;
    fs.writeFileSync(errorFile, JSON.stringify(results.errors, null, 2));
    console.log(`\n📝 Full error log saved to: ${errorFile}`);
  }

  console.log('\n🎉 All done!\n');
}

main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});
