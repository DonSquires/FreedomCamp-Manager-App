/**
 * DEBUG IMPORT RESPONSE
 * 
 * Shows exactly what the Edge Function returns
 * Helps diagnose "Cannot read properties" errors
 */

const https = require('https');
const fs = require('fs');

const SUPABASE_URL = 'https://xbfnlzmpumthnjmtqufp.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // UPDATE THIS

// Test with just 1 record
const testData = {
  "records": [
    {
      "id": 8884,
      "title": "LINZ - Jacksons Inlet",
      "recordeddate": "3/02/2026",
      "rego": "TEST99",
      "note": "Debug test",
      "attachments": 0
    }
  ]
};

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

console.log('🔍 DEBUG: Testing Edge Function Response\n');
console.log('Request payload:', JSON.stringify(testData, null, 2), '\n');

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`HTTP Status: ${res.statusCode}\n`);
    console.log('=== RAW RESPONSE ===');
    console.log(data);
    console.log('===================\n');

    try {
      const result = JSON.parse(data);
      
      console.log('=== PARSED RESPONSE ===');
      console.log(JSON.stringify(result, null, 2));
      console.log('=======================\n');
      
      console.log('=== RESPONSE STRUCTURE ===');
      console.log('result.success:', result.success);
      console.log('result.summary:', result.summary);
      console.log('result.observations:', result.observations);
      console.log('==========================\n');
      
      console.log('=== AVAILABLE PROPERTIES ===');
      if (result.summary) {
        Object.keys(result.summary).forEach(key => {
          console.log(`  summary.${key}: ${JSON.stringify(result.summary[key])}`);
        });
      }
      console.log('============================\n');
      
      console.log('✅ Edge Function is working correctly!');
      console.log('\n💡 Use these property names in your import script:');
      console.log('   - result.summary.total');
      console.log('   - result.summary.successful');
      console.log('   - result.summary.failed');
      console.log('   - result.summary.errors');
      console.log('   - result.observations (array)');
      
    } catch (error) {
      console.error('❌ Parse error:', error.message);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error);
});

req.write(payload);
req.end();
