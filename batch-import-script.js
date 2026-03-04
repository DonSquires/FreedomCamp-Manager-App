/**
 * HISTORICAL DATA BATCH IMPORT SCRIPT
 * 
 * Imports Vehicle Log.xlsx data in batches to avoid timeouts
 * 
 * REQUIREMENTS:
 * 1. Node.js installed
 * 2. vehicle-log.json file (converted from Excel)
 * 3. Supabase project URL and anon key
 * 
 * USAGE:
 * node batch-import-script.js
 */

const fs = require('fs');
const https = require('https');

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================
const SUPABASE_URL = 'https://xbfnlzmpumthnjmtqufp.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Get from Supabase Dashboard
const BATCH_SIZE = 100; // Records per batch (recommended: 100-200)
const DELAY_MS = 2000; // Delay between batches (milliseconds)
const INPUT_FILE = 'vehicle-log.json'; // Your converted JSON file

// ============================================
// BATCH IMPORT LOGIC
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

    console.log(`\n📦 Batch ${batchNumber}/${totalBatches} - Importing ${records.length} records...`);

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
  console.log('🚀 HISTORICAL DATA BATCH IMPORT');
  console.log('================================\n');

  // Validate configuration
  if (SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    console.error('❌ ERROR: Please update SUPABASE_ANON_KEY in the script');
    process.exit(1);
  }

  // Load JSON file
  let data;
  try {
    const fileContent = fs.readFileSync(INPUT_FILE, 'utf8');
    data = JSON.parse(fileContent);
  } catch (error) {
    console.error(`❌ ERROR: Failed to load ${INPUT_FILE}:`, error.message);
    console.log('\n💡 Make sure you converted Vehicle Log.xlsx to JSON first!');
    process.exit(1);
  }

  const allRecords = data.records;
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

  console.log('\n\n================================');
  console.log('✅ IMPORT COMPLETE!');
  console.log('================================\n');
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
