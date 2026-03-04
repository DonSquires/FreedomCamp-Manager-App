import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentLocation, findNearestZone } from '@/services/gpsService';
import { savePhotoLocally } from '@/services/cameraService';
import { recognizePlate } from '@/services/plateRecognitionService';

interface CameraScannerProps {
  onScanComplete: (data: {
    plateNumber: string;
    photoPath: string;
    gpsLatitude: number | null;
    gpsLongitude: number | null;
    zoneId: string | null;
    zoneName: string | null;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleColor?: string;
  }) => void;
  onClose: () => void;
}

export default function CameraScanner({ onScanComplete, onClose }: CameraScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const cameraRef = useRef<any>(null);

  // Load saved zoom level on mount
  useEffect(() => {
    loadSavedZoom();
  }, []);

  const loadSavedZoom = async () => {
    try {
      const savedZoom = await AsyncStorage.getItem('camera_zoom_level');
      if (savedZoom !== null) {
        setZoom(parseFloat(savedZoom));
      }
    } catch (error) {
      console.error('Error loading saved zoom:', error);
    }
  };

  const saveZoomLevel = async (newZoom: number) => {
    try {
      await AsyncStorage.setItem('camera_zoom_level', newZoom.toString());
    } catch (error) {
      console.error('Error saving zoom:', error);
    }
  };

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    saveZoomLevel(newZoom); // Persist zoom level
  };

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, []);

  const handleCameraReady = () => {
    console.log('✓ Camera ready');
    setIsCameraReady(true);
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isProcessing || !isCameraReady) {
      console.log('Camera not ready:', { hasRef: !!cameraRef.current, isProcessing, isCameraReady });
      Alert.alert('Camera Not Ready', 'Please wait for camera to initialize');
      return;
    }

    setIsProcessing(true);
    setStatusMessage('📸 Capturing photo...');

    try {
      // Step 1: Capture photo with error handling
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      }).catch((err: any) => {
        console.error('takePictureAsync error:', err);
        throw new Error(`Camera capture failed: ${err.message || 'Unknown error'}`);
      });

      if (!photo || !photo.uri) {
        throw new Error('Failed to capture photo - no image data returned');
      }

      console.log('📸 Photo captured, size:', photo.width, 'x', photo.height);

      setStatusMessage('📍 Getting GPS location...');

      // Step 2: Get GPS location
      const location = await getCurrentLocation();
      const gpsLatitude = location?.latitude || null;
      const gpsLongitude = location?.longitude || null;

      // Step 3: Find nearest zone
      let zoneId: string | null = null;
      let zoneName: string | null = null;

      if (location) {
        const nearestZone = await findNearestZone(location.latitude, location.longitude);
        if (nearestZone) {
          zoneId = nearestZone.zoneId;
          zoneName = nearestZone.zoneName;
          console.log(`📍 Auto-detected zone: ${zoneName} (${nearestZone.distance}m away)`);
        } else {
          console.log('⚠️ No zone found within 5km radius');
        }
      }

      setStatusMessage('💾 Saving photo...');

      // Step 4: Save photo FIRST (with temporary filename)
      const timestamp = Date.now();
      const tempPlate = `TEMP_${timestamp}`;
      const { localPath } = await savePhotoLocally(
        photo.uri,
        tempPlate,
        gpsLatitude,
        gpsLongitude
      );

      console.log('✅ Photo saved locally:', localPath);

      setStatusMessage('🤖 Recognizing license plate...');

      // Step 5: Scan the SAVED photo for plate recognition
      const recognition = await recognizePlate(localPath);

      if (!recognition.success || !recognition.plateNumber) {
        // Photo is still saved even if recognition fails
        console.log('⚠️ Plate not detected, but photo is saved');
        Alert.alert(
          'Plate Not Detected',
          'Could not read license plate clearly. Photo has been saved. You can enter the plate number manually.',
          [{ text: 'OK' }]
        );
        
        // Return with saved photo but no plate number
        onScanComplete({
          plateNumber: '',
          photoPath: localPath,
          gpsLatitude,
          gpsLongitude,
          zoneId,
          zoneName,
        });
        return;
      }

      console.log(`✅ Plate recognized: ${recognition.plateNumber}`);
      console.log(`   Vehicle: ${recognition.vehicleMake || 'Unknown'} ${recognition.vehicleModel || ''} (${recognition.vehicleColor || 'Unknown'})`);
      console.log(`   Confidence: ${Math.round(recognition.confidence * 100)}%`);

      // Step 6: Return results with saved photo and recognition data
      onScanComplete({
        plateNumber: recognition.plateNumber,
        photoPath: localPath,
        gpsLatitude,
        gpsLongitude,
        zoneId,
        zoneName,
        vehicleMake: recognition.vehicleMake,
        vehicleModel: recognition.vehicleModel,
        vehicleColor: recognition.vehicleColor,
      });

    } catch (error: any) {
      console.error('Camera capture error:', error);
      Alert.alert('Scan Error', error.message || 'Failed to capture image');
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00b4d8" />
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <MaterialIcons name="camera-alt" size={80} color="#666" />
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        enableTorch={torchEnabled}
        zoom={zoom}
        onCameraReady={handleCameraReady}
      >
        {/* Overlay Frame */}
        <View style={styles.overlay}>
          <View style={styles.frame}>
            <View style={styles.corner} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerText}>Center license plate in frame</Text>
          <View style={styles.spacer} />
        </View>

        {/* Torch and Zoom Controls */}
        <View style={styles.controls}>
          {/* Torch Toggle */}
          <TouchableOpacity
            style={[styles.flashButton, torchEnabled && styles.torchActive]}
            onPress={() => setTorchEnabled(!torchEnabled)}
          >
            <MaterialIcons
              name={torchEnabled ? 'flashlight-on' : 'flashlight-off'}
              size={24}
              color={torchEnabled ? '#ffd700' : '#fff'}
            />
            <Text style={[styles.flashText, torchEnabled && styles.torchActiveText]}>
              Torch {torchEnabled ? 'ON' : 'OFF'}
            </Text>
          </TouchableOpacity>

          {/* Zoom Slider - Sticky (Persists Between Scans) */}
          <View style={styles.zoomControl}>
            <MaterialIcons name="zoom-out" size={20} color="#fff" />
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              value={zoom}
              onValueChange={handleZoomChange}
              minimumTrackTintColor="#00b4d8"
              maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
              thumbTintColor="#00b4d8"
            />
            <MaterialIcons name="zoom-in" size={20} color="#fff" />
            <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
          </View>
        </View>

        {/* Camera Ready Indicator */}
        {!isCameraReady && (
          <View style={styles.statusBar}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.statusText}>Initializing camera...</Text>
          </View>
        )}

        {/* Status Message */}
        {statusMessage && (
          <View style={styles.statusBar}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        )}

        {/* Capture Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.captureButton,
              (isProcessing || !isCameraReady) && styles.captureButtonDisabled
            ]}
            onPress={handleCapture}
            disabled={isProcessing || !isCameraReady}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frame: {
    width: 300,
    height: 150,
    borderWidth: 2,
    borderColor: '#00b4d8',
    borderRadius: 12,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#00b4d8',
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTopRight: {
    left: undefined,
    right: -2,
    borderLeftWidth: 0,
    borderRightWidth: 4,
  },
  cornerBottomLeft: {
    top: undefined,
    bottom: -2,
    borderTopWidth: 0,
    borderBottomWidth: 4,
  },
  cornerBottomRight: {
    top: undefined,
    left: undefined,
    right: -2,
    bottom: -2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  spacer: {
    width: 44,
  },
  controls: {
    position: 'absolute',
    top: 110,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 12,
  },
  flashButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  torchActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
    borderWidth: 1,
    borderColor: '#ffd700',
  },
  flashText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  torchActiveText: {
    color: '#ffd700',
  },
  zoomControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  zoomText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  statusBar: {
    position: 'absolute',
    top: 200,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 12,
    gap: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  permissionText: {
    color: '#999',
    fontSize: 16,
    marginTop: 24,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 24,
    backgroundColor: '#00b4d8',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
