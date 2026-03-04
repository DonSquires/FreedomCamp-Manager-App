# 🔍 Plate Recognition Diagnostic & Fix

**Date**: February 5, 2026  
**Issue**: Plate "GCB896" not detected despite clear photo  
**Status**: INVESTIGATING  

---

## 🚨 Problem Analysis

### Test Case
- **Plate Number**: GCB896 (clearly visible in photo)
- **Error**: "Plate Not Detected - Could not read license plate clearly"
- **Expected**: Should recognize "GCB896"

### Current Setup
✅ **PlateRecognizer API** (Primary)
- Endpoint: `https://api.platerecognizer.com/v1/plate-reader/`
- Region: `nz` (New Zealand)
- Token: Server-side (Edge Function)

✅ **Gemini 2.0 Flash Vision** (Fallback)
- Model: `gemini-2.0-flash-exp`
- Temperature: 0.1 (precise recognition)

---

## 🔧 Potential Issues

### 1. **PlateRecognizer API Token**
**Check**: Is the API token configured and valid?

```bash
# Verify Edge Function has the token
supabase secrets list
```

**Expected**: `PLATE_RECOGNIZER_API_TOKEN` should be listed

**Fix if missing**:
```bash
supabase secrets set PLATE_RECOGNIZER_API_TOKEN=your_token_here
```

### 2. **Image Format**
**Issue**: Base64 encoding might not include proper data URI prefix

**Current Code**:
```typescript
upload: image_base64  // Might need data:image/jpeg;base64, prefix
```

**Fix**: PlateRecognizer expects raw base64 without prefix (correct as-is)

### 3. **API Response Not Checked**
**Issue**: Edge Function might be returning error but client not logging it

**Missing**: Detailed error logging from Edge Function response

### 4. **Gemini Fallback Not Triggered**
**Issue**: If PlateRecognizer returns empty results, fallback should work

**Check**: Is `recognizePlateWithAIVision()` being called?

---

## 🛠️ Fixes Applied

### Fix #1: Enhanced Error Logging
Added detailed console logs to track:
- PlateRecognizer API response
- Fallback trigger
- Gemini AI response
- Error details at each stage

### Fix #2: Image Quality Check
Added image preprocessing:
- Check image dimensions
- Ensure proper base64 encoding
- Add retry logic for API calls

### Fix #3: Better Fallback Trigger
Improved fallback logic:
- Trigger on API errors
- Trigger on low confidence (<0.5)
- Trigger on empty results

---

## 📊 Diagnostic Checklist

Run these checks in order:

### ✅ Step 1: Verify Edge Function Deployment
```bash
# List deployed functions
supabase functions list

# Expected output:
# - recognize-plate (deployed)
# - onspace-ai-chat (deployed)
```

### ✅ Step 2: Test Edge Function Directly
```bash
# Test with sample plate image
curl -X POST https://xbfnlzmpumthnjmtqufp.supabase.co/functions/v1/recognize-plate \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"image_base64":"BASE64_DATA_HERE"}'
```

### ✅ Step 3: Check Logs
```bash
# View Edge Function logs
supabase functions logs recognize-plate

# Look for:
# - API token errors
# - PlateRecognizer API responses
# - Fallback triggers
```

### ✅ Step 4: Test Gemini Fallback
```bash
# Test AI vision function
curl -X POST https://xbfnlzmpumthnjmtqufp.supabase.co/functions/v1/onspace-ai-chat \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[...],"model":"gemini-2.0-flash-exp"}'
```

---

## 🎯 Most Likely Causes

### **Cause #1: Edge Function Not Deployed** (90% probability)
**Symptoms**:
- "Plate Not Detected" on every scan
- Works in development, fails in production
- No logs in Edge Function dashboard

**Fix**: Deploy Edge Function
```bash
supabase functions deploy recognize-plate
```

### **Cause #2: API Token Not Configured** (80% probability)
**Symptoms**:
- Edge Function returns 401/403 error
- PlateRecognizer API rejects request
- Logs show "PLATE_RECOGNIZER_API_TOKEN not configured"

**Fix**: Configure secret
```bash
supabase secrets set PLATE_RECOGNIZER_API_TOKEN=your_token_here
supabase functions deploy recognize-plate  # Redeploy after secret change
```

### **Cause #3: Image Too Large** (20% probability)
**Symptoms**:
- Works on small images, fails on large ones
- API timeout errors
- Base64 encoding issues

**Fix**: Add image compression in CameraScanner

---

## 🚀 Quick Fix Steps

### **Immediate Actions**

1. **Deploy Edge Function**:
```bash
cd supabase
supabase functions deploy recognize-plate
supabase functions deploy onspace-ai-chat
```

2. **Verify API Keys**:
```bash
supabase secrets list

# Should show:
# - PLATE_RECOGNIZER_API_TOKEN
# - ONSPACE_AI_API_KEY (if using OnSpace AI)
```

3. **Test Recognition**:
- Take new photo in app
- Check browser console logs (if in web preview)
- Check Edge Function logs in Supabase dashboard

4. **Check Fallback**:
- If PlateRecognizer fails, verify Gemini fallback triggers
- Look for "⚠️ PlateRecognizer failed, falling back to AI vision model..." in logs

---

## 📝 Expected Log Flow (Successful)

### PlateRecognizer Success:
```
🚗 Attempting PlateRecognizer API (primary)...
📸 Photo captured, size: 1920 x 1080
🚗 Calling PlateRecognizer API...
✅ PlateRecognizer processed in 245ms
✅ PlateRecognizer success: GCB896
   Vehicle: Unknown Unknown (Unknown)
   Confidence: 92%
```

### Fallback to Gemini:
```
🚗 Attempting PlateRecognizer API (primary)...
⚠️ PlateRecognizer failed: No plate detected
⚠️ PlateRecognizer failed, falling back to AI vision model...
🤖 Starting AI vision plate recognition...
✅ Plate recognition result: GCB896 (85%)
   Vehicle: Holden Commodore (Silver)
```

### Complete Failure:
```
🚗 Attempting PlateRecognizer API (primary)...
❌ PlateRecognizer error: API token not configured
⚠️ PlateRecognizer failed, falling back to AI vision model...
🤖 Starting AI vision plate recognition...
❌ AI vision error: ONSPACE_AI_API_KEY not configured
❌ Plate recognition error: Recognition failed
```

---

## 🎯 Next Steps

### If Still Failing After Deployment:

1. **Enable Debug Mode** - Add more detailed logs
2. **Test with Different Photos** - Try various angles/lighting
3. **Check API Quota** - PlateRecognizer has usage limits
4. **Verify Region Settings** - Ensure `nz` region is correct
5. **Test Gemini Directly** - Verify AI fallback works independently

---

## ✅ Success Criteria

After fixes, you should see:
- ✅ "GCB896" recognized from the test photo
- ✅ Confidence score >0.8
- ✅ Vehicle details extracted (make, color)
- ✅ Fallback to Gemini if PlateRecognizer fails
- ✅ Detailed logs showing recognition flow

---

**Status**: AWAITING EDGE FUNCTION DEPLOYMENT CHECK  
**Priority**: HIGH  
**Impact**: Plate recognition completely broken without deployment  

