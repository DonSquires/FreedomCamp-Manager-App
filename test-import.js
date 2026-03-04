/**
 * TEST IMPORT SCRIPT - 10 Records
 * 
 * Tests the import-historical-data Edge Function with a small sample
 * 
 * REQUIREMENTS:
 * 1. Node.js installed
 * 2. test-import-10-records.json file
 * 3. Supabase anon key
 * 4. Test zones created in database
 * 
 * USAGE:
 * node test-import.js
 */

const https = require('https');
const fs = require('fs');

// ============================================
// CONFIGURATION - UPDATE YOUR ANON KEY
// ============================================
const SUPABASE_URL = 'https://xbfnlzmpumthnjmtqufp.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Get from Supabase Dashboard → Settings → API

// ============================================
// TEST IMPORT
// ============================================

async function testImport() {
  console.log('🧪 TESTING IMPORT WITH 10 RECORDS');
  console.log('===================================\n');

  // Validate configuration
  if (SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    console.error('❌ ERROR: Please update SUPABASE_ANON_KEY in the script');
    console.log('\n💡 Get your anon key from: Supabase Dashboard → Settings → API\n');
    process.exit(1);
  }

  // Load test data
  let testData;
  try {
    testData = JSON.parse(fs.readFileSync('test-import-10-records.json', 'utf8'));
    console.log(`✅ Loaded test file: ${testData.records.length} records\n`);
  } catch (error) {
    console.error('❌ ERROR: Failed to load test-import-10-records.json');
    console.error(error.message);
    process.exit(1);
  }

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

  console.log('📡 Calling Edge Function...\n');

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`📊 HTTP Status: ${res.statusCode}\n`);

        try {
          const result = JSON.parse(data);

          if (res.statusCode === 200) {
            console.log('✅ IMPORT SUCCESSFUL!\n');
            console.log('Summary:');
            console.log(`   - Total: ${result.summary.total}`);
            console.log(`   - Successful: ${result.summary.successful} ✅`);
            console.log(`   - Failed: ${result.summary.failed} ❌`);

            if (result.summary.zonesNotFound && result.summary.zonesNotFound.length > 0) {
              console.log(`\n⚠️ Zones not found:`);
              result.summary.zonesNotFound.forEach(z => console.log(`   - ${z}`));
              console.log('\n💡 Create these zones first (see DEPLOYMENT_TEST_GUIDE.md Step 2)');
            }

            if (result.summary.errors && result.summary.errors.length > 0) {
              console.log(`\n❌ Errors:`);
              result.summary.errors.forEach(err => {
                console.log(`   - Record ${err.record}: ${err.error}`);
              });
            }

            console.log('\n📋 Sample Observations:');
            result.observations.slice(0, 3).forEach(obs => {
              console.log(`   - ${obs.plate} at ${obs.zone} on ${obs.date}`);
            });

            console.log('\n✅ Test complete! See DEPLOYMENT_TEST_GUIDE.md Step 4 for verification SQL.');
            resolve(result);
          } else {
            console.error('❌ IMPORT FAILED\n');
            console.error('Response:', JSON.stringify(result, null, 2));
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        } catch (error) {
          console.error('❌ Parse error:', error);
          console.error('Raw response:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

testImport()
  .then(() => {
    console.log('\n🎉 Done!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
