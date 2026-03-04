import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PlateRecognitionResult {
  success: boolean;
  plateNumber: string | null;
  confidence: number;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  error?: string;
}

/**
 * Recognize license plate using PlateRecognizer API (Primary)
 * Falls back to AI vision model if PlateRecognizer fails
 */
export async function recognizePlate(
  photoUri: string
): Promise<PlateRecognitionResult> {
  try {
    // Try PlateRecognizer first (specialized ALPR)
    console.log('🚗 Attempting PlateRecognizer API (primary)...');
    const plateRecognizerResult = await recognizePlateWithPlateRecognizer(photoUri);
    
    if (plateRecognizerResult.success && plateRecognizerResult.plateNumber) {
      console.log(`✅ PlateRecognizer success: ${plateRecognizerResult.plateNumber}`);
      return plateRecognizerResult;
    }

    // Fallback to AI vision model
    console.log('⚠️ PlateRecognizer failed, falling back to AI vision model...');
    return await recognizePlateWithAIVision(photoUri);

  } catch (error: any) {
    console.error('Plate recognition error:', error);
    return {
      success: false,
      plateNumber: null,
      confidence: 0,
      error: error.message || 'Recognition failed',
    };
  }
}

/**
 * Primary: PlateRecognizer API (Specialized ALPR)
 */
async function recognizePlateWithPlateRecognizer(
  photoUri: string
): Promise<PlateRecognitionResult> {
  try {
    console.log('📸 Reading photo for PlateRecognizer...');
    
    // Read photo as base64
    const response = await fetch(photoUri);
    const blob = await response.blob();
    console.log(`📷 Photo blob size: ${(blob.size / 1024).toFixed(1)}KB`);
    
    const reader = new FileReader();
    
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1];
        console.log(`✓ Base64 encoded (${(base64Data.length / 1024).toFixed(1)}KB)`);
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    const base64Data = await base64Promise;

    console.log('📡 Calling PlateRecognizer Edge Function...');
    
    // Call PlateRecognizer Edge Function (server-side API call)
    const { data, error } = await supabase.functions.invoke('recognize-plate', {
      body: {
        image_base64: base64Data,
      },
    });

    if (error) {
      console.error('❌ PlateRecognizer Edge Function error:', error);
      console.error('   Error details:', JSON.stringify(error, null, 2));
      return {
        success: false,
        plateNumber: null,
        confidence: 0,
        error: error.message,
      };
    }

    console.log('📊 PlateRecognizer response:', JSON.stringify(data, null, 2));

    if (!data.success || !data.plateNumber) {
      console.log('⚠️ PlateRecognizer returned no results');
      return {
        success: false,
        plateNumber: null,
        confidence: 0,
        error: data.message || 'No plate detected',
      };
    }

    console.log(`✅ PlateRecognizer detected: ${data.plateNumber} (confidence: ${Math.round(data.confidence * 100)}%)`);
    if (data.vehicleMake) console.log(`   Vehicle: ${data.vehicleMake} ${data.vehicleColor || ''}`);

    return {
      success: data.success,
      plateNumber: data.plateNumber?.toUpperCase() || null,
      confidence: data.confidence || 0,
      vehicleMake: data.vehicleMake,
      vehicleColor: data.vehicleColor,
    };
  } catch (error: any) {
    console.error('❌ PlateRecognizer exception:', error);
    console.error('   Stack:', error.stack);
    return {
      success: false,
      plateNumber: null,
      confidence: 0,
      error: error.message || 'PlateRecognizer failed',
    };
  }
}

/**
 * Fallback: AI Vision Model (General Vision Recognition)
 */
async function recognizePlateWithAIVision(
  photoUri: string
): Promise<PlateRecognitionResult> {
  try {
    console.log('🤖 Starting AI vision plate recognition...');
    
    // Read photo as base64
    const response = await fetch(photoUri);
    const blob = await response.blob();
    const reader = new FileReader();
    
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    const base64Data = await base64Promise;

    console.log('📡 Calling Gemini AI Vision Edge Function...');
    
    // Call AI vision Edge Function
    const { data, error } = await supabase.functions.invoke('onspace-ai-chat', {
      body: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`,
                },
              },
              {
                type: 'text',
                text: `Analyze this vehicle image and extract:
1. License plate number (New Zealand format, MUST be exact)
2. Vehicle make (e.g., Toyota, Ford, Holden)
3. Vehicle model (e.g., Hilux, Ranger, Commodore)
4. Vehicle color (primary color only)

Respond ONLY in this exact JSON format:
{
  "plate_number": "ABC123",
  "vehicle_make": "Toyota",
  "vehicle_model": "Hilux",
  "vehicle_color": "White",
  "confidence": 0.95
}

If you cannot detect a license plate clearly, set plate_number to null and confidence to 0.`,
              },
            ],
          },
        ],
        model: 'gemini-2.0-flash-exp',
        temperature: 0.1,
      },
    });

    if (error) {
      console.error('❌ Gemini AI vision error:', error);
      console.error('   Error details:', JSON.stringify(error, null, 2));
      return {
        success: false,
        plateNumber: null,
        confidence: 0,
        error: error.message,
      };
    }

    console.log('📊 Gemini AI response:', JSON.stringify(data, null, 2));

    // Parse AI response
    const aiResponse = data.choices[0].message.content;
    console.log('🤖 Gemini content:', aiResponse.substring(0, 200) + '...');
    
    // Extract JSON from response (handles markdown code blocks)
    let jsonStr = aiResponse;
    const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
      console.log('✓ Extracted JSON from markdown code block');
    }
    
    const result = JSON.parse(jsonStr);

    console.log(`✅ Gemini plate recognition result: ${result.plate_number || 'NOT DETECTED'} (${Math.round(result.confidence * 100)}%)`);
    if (result.vehicle_make) console.log(`   Vehicle: ${result.vehicle_make} ${result.vehicle_model || ''} (${result.vehicle_color || 'Unknown color'})`);

    return {
      success: result.plate_number !== null,
      plateNumber: result.plate_number?.toUpperCase() || null,
      confidence: result.confidence || 0,
      vehicleMake: result.vehicle_make,
      vehicleModel: result.vehicle_model,
      vehicleColor: result.vehicle_color,
    };
  } catch (error: any) {
    console.error('Plate recognition error:', error);
    return {
      success: false,
      plateNumber: null,
      confidence: 0,
      error: error.message || 'Recognition failed',
    };
  }
}

/**
 * Fallback: Manual plate entry
 */
export async function manualPlateEntry(plateNumber: string): Promise<PlateRecognitionResult> {
  return {
    success: true,
    plateNumber: plateNumber.toUpperCase(),
    confidence: 1.0,
  };
}
