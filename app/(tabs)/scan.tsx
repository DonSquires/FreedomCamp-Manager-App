import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { calculateLocalCompliance, checkFlaggedVehicle, getVehicleHistory } from '@/services/complianceService';
import { addToUploadQueue } from '@/services/uploadQueue';
import { getDatabase } from '@/services/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CameraScanner from '@/components/CameraScanner';
import ScanConfirmation from '@/components/ScanConfirmation';
import { getAllZones } from '@/services/gpsService';
import StatusHeader from '@/components/StatusHeader';

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [currentZone, setCurrentZone] = useState<{ id: string; name: string } | null>(null);
  const [availableZones, setAvailableZones] = useState<Array<{ id: string; name: string }>>([]);
  const [showZoneSelector, setShowZoneSelector] = useState(false);

  // Scan data
  const [scanData, setScanData] = useState<any>(null);
  
  // Compliance results
  const [complianceResult, setComplianceResult] = useState<any>(null);
  const [flaggedInfo, setFlaggedInfo] = useState<any>(null);
  const [vehicleHistory, setVehicleHistory] = useState<any[]>([]);

  useEffect(() => {
    loadAvailableZones();
  }, []);

  const loadAvailableZones = async () => {
    const zones = await getAllZones();
    setAvailableZones(zones);
  };

  const handleCameraScan = () => {
    setShowCamera(true);
  };

  const handleScanComplete = async (cameraData: any) => {
    setShowCamera(false);
    setScanData(cameraData);

    // Set zone
    if (cameraData.zoneId && cameraData.zoneName) {
      setCurrentZone({ id: cameraData.zoneId, name: cameraData.zoneName });
    } else {
      setCurrentZone({ id: 'other_location', name: 'Other Location' });
    }

    // Show confirmation screen
    setShowConfirmation(true);
  };

  const handleConfirmationComplete = async (confirmedData: any) => {
    setShowConfirmation(false);
    setIsScanning(true);

    try {
      // Update/create canonical vehicle record
      const db = getDatabase();
      await db.runAsync(
        `INSERT OR REPLACE INTO canonical_vehicles (
          plate_number, vehicle_make, vehicle_model, vehicle_color, vehicle_year,
          self_contained, self_contained_expiry, homeless_status, homeless_notes,
          first_seen_at, last_seen_at, total_observations, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
          COALESCE((SELECT total_observations FROM canonical_vehicles WHERE plate_number = ?), 0),
          ?)`,
        confirmedData.plateNumber,
        confirmedData.vehicleMake,
        confirmedData.vehicleModel,
        confirmedData.vehicleColor,
        confirmedData.vehicleYear ? parseInt(confirmedData.vehicleYear) : null,
        confirmedData.selfContained ? 1 : 0,
        confirmedData.selfContainedExpiry || null,
        confirmedData.homelessClaimed ? 'claimed' : 'none',
        confirmedData.homelessNotes || null,
        new Date().toISOString(),
        new Date().toISOString(),
        confirmedData.plateNumber,
        new Date().toISOString()
      );

      // Check if flagged
      const flagged = await checkFlaggedVehicle(confirmedData.plateNumber);
      setFlaggedInfo(flagged);

      if (flagged.isFlagged) {
        Alert.alert(
          '⚠️ FLAGGED VEHICLE',
          `Priority: ${flagged.priority}\nReason: ${flagged.reason}\n\n${flagged.notes || ''}`,
          [{ text: 'Continue' }]
        );
      }

      // Calculate compliance
      if (!currentZone || currentZone.id === 'other_location') {
        Alert.alert('Error', 'Please select a zone for compliance check');
        setIsScanning(false);
        return;
      }

      const compliance = await calculateLocalCompliance(
        confirmedData.plateNumber,
        currentZone.id
      );
      setComplianceResult(compliance);

      // Get history
      const history = await getVehicleHistory(
        confirmedData.plateNumber,
        currentZone.id,
        5
      );
      setVehicleHistory(history);

      // Show compliance status
      if (compliance.isBreach) {
        Alert.alert(
          '🚨 BREACH DETECTED',
          `Type: ${compliance.breachType}\n\nViolations:\n${compliance.violationReasons.join('\n')}`,
          [{ text: 'OK' }]
        );
      } else if (compliance.consecutiveNights >= compliance.maxConsecutiveAllowed - 1) {
        Alert.alert(
          '⚠️ ALMOST A BREACH',
          `Vehicle is approaching consecutive nights limit (${compliance.consecutiveNights}/${compliance.maxConsecutiveAllowed})`,
          [{ text: 'OK' }]
        );
      }

    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleRecordObservation = async () => {
    try {
      if (!currentZone || !scanData) {
        Alert.alert('Error', 'Missing scan data');
        return;
      }

      const profileStr = await AsyncStorage.getItem('user_profile');
      if (!profileStr) throw new Error('User profile not found');
      
      const profile = JSON.parse(profileStr);

      // Add photo to queue
      if (scanData.photoPath) {
        const photoData = {
          local_path: scanData.photoPath,
          plate_number: complianceResult?.plateNumber || '',
          gps_latitude: scanData.gpsLatitude,
          gps_longitude: scanData.gpsLongitude,
          captured_at: new Date().toISOString(),
        };
        await addToUploadQueue('photo', photoData);
      }

      // Add observation to queue
      const observationData = {
        plate_number: complianceResult?.plateNumber || '',
        zone_id: currentZone.id,
        organization_id: profile.organization_id,
        recorded_by: profile.id,
        recorded_at: new Date().toISOString(),
        self_contained: complianceResult?.isSelfContained || false,
        is_compliant: complianceResult?.isCompliant || true,
        gps_latitude: scanData.gpsLatitude || null,
        gps_longitude: scanData.gpsLongitude || null,
      };

      await addToUploadQueue('observation', observationData);
      
      Alert.alert(
        'Success',
        `Observation recorded\nZone: ${currentZone.name}\nQueued for sync`,
        [
          { text: 'View Details', onPress: () => router.push({ pathname: '/vehicle-details', params: { plate: complianceResult?.plateNumber } }) },
          { text: 'Scan Another', onPress: resetScan },
        ]
      );
      
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleEnforcementAction = () => {
    if (!complianceResult) {
      Alert.alert('Error', 'No compliance data');
      return;
    }

    router.push({
      pathname: '/enforcement/create',
      params: {
        plate: complianceResult.plateNumber,
        zoneId: currentZone?.id,
        breachType: complianceResult.breachType || 'warning',
      },
    });
  };

  const handleAddIncident = () => {
    Alert.alert(
      'Add Incident',
      'Choose incident type:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Health & Safety', onPress: () => {/* Navigate to H&S report */} },
        { text: 'General Incident', onPress: () => {/* Navigate to incident report */} },
      ]
    );
  };

  const resetScan = () => {
    setScanData(null);
    setComplianceResult(null);
    setFlaggedInfo(null);
    setVehicleHistory([]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusHeader currentZone={currentZone?.name} />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scan Vehicle</Text>
        {complianceResult && (
          <TouchableOpacity onPress={resetScan}>
            <MaterialIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {!complianceResult ? (
          /* Initial Scan State */
          <>
            <TouchableOpacity
              style={styles.primaryScanButton}
              onPress={handleCameraScan}
              activeOpacity={0.8}
            >
              <View style={styles.scanButtonIcon}>
                <MaterialIcons name="camera-alt" size={56} color="#fff" />
              </View>
              <View style={styles.scanButtonContent}>
                <Text style={styles.scanButtonTitle}>SCAN PLATE</Text>
                <Text style={styles.scanButtonSubtext}>Photo → Scan → Confirm → Compliance</Text>
              </View>
              <MaterialIcons name="qr-code-scanner" size={40} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            {currentZone && (
              <TouchableOpacity 
                style={styles.zoneCard}
                onPress={() => setShowZoneSelector(true)}
              >
                <MaterialIcons name="location-on" size={24} color="#00b4d8" />
                <View style={styles.zoneCardContent}>
                  <Text style={styles.zoneCardTitle}>Current Zone</Text>
                  <Text style={styles.zoneCardName}>{currentZone.name}</Text>
                </View>
                <MaterialIcons name="edit" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </>
        ) : (
          /* Compliance Results State */
          <>
            {/* Flagged Alert */}
            {flaggedInfo?.isFlagged && (
              <View style={styles.flaggedCard}>
                <MaterialIcons name="flag" size={32} color="#f44336" />
                <View style={styles.flaggedText}>
                  <Text style={styles.flaggedTitle}>⚠️ FLAGGED VEHICLE</Text>
                  <Text style={styles.flaggedReason}>{flaggedInfo.reason}</Text>
                  <Text style={styles.flaggedPriority}>Priority: {flaggedInfo.priority}</Text>
                </View>
              </View>
            )}

            {/* Compliance Card */}
            <View style={[
              styles.complianceCard,
              complianceResult.isBreach ? styles.complianceBreach : styles.complianceGood
            ]}>
              <View style={styles.complianceHeader}>
                <MaterialIcons
                  name={complianceResult.isBreach ? 'warning' : 'check-circle'}
                  size={48}
                  color={complianceResult.isBreach ? '#f44336' : '#4caf50'}
                />
                <View style={styles.complianceHeaderText}>
                  <Text style={styles.complianceStatus}>
                    {complianceResult.isBreach ? 'BREACH DETECTED' : 'COMPLIANT'}
                  </Text>
                  <Text style={styles.compliancePlate}>{complianceResult.plateNumber || 'N/A'}</Text>
                </View>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>
                    {complianceResult.consecutiveNights}/{complianceResult.maxConsecutiveAllowed}
                  </Text>
                  <Text style={styles.metricLabel}>Consecutive Nights</Text>
                </View>

                <View style={styles.metric}>
                  <Text style={styles.metricValue}>
                    {complianceResult.monthlyNights}/{complianceResult.maxMonthlyAllowed}
                  </Text>
                  <Text style={styles.metricLabel}>Monthly Nights</Text>
                </View>
              </View>

              {complianceResult.violationReasons.length > 0 && (
                <View style={styles.violationsSection}>
                  <Text style={styles.violationsTitle}>Violations:</Text>
                  {complianceResult.violationReasons.map((reason: string, index: number) => (
                    <Text key={index} style={styles.violationItem}>• {reason}</Text>
                  ))}
                </View>
              )}

              {complianceResult.homelessExemption && (
                <View style={styles.exemptionBanner}>
                  <MaterialIcons name="info" size={20} color="#00b4d8" />
                  <Text style={styles.exemptionText}>Homeless Exemption Applies</Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsGrid}>
              <TouchableOpacity style={styles.actionButton} onPress={handleRecordObservation}>
                <MaterialIcons name="add-circle" size={32} color="#00b4d8" />
                <Text style={styles.actionButtonText}>Record Observation</Text>
              </TouchableOpacity>

              {complianceResult.isBreach && (
                <TouchableOpacity 
                  style={[styles.actionButton, styles.actionButtonWarning]} 
                  onPress={handleEnforcementAction}
                >
                  <MaterialIcons name="gavel" size={32} color="#f44336" />
                  <Text style={styles.actionButtonText}>Enforcement Action</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionButton} onPress={handleAddIncident}>
                <MaterialIcons name="report-problem" size={32} color="#ff9800" />
                <Text style={styles.actionButtonText}>Add H&S/Incident</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionButton, styles.actionButtonSecondary]} 
                onPress={() => router.push({ pathname: '/vehicle-details', params: { plate: complianceResult.plateNumber } })}
              >
                <MaterialIcons name="info" size={32} color="#999" />
                <Text style={styles.actionButtonText}>View Full Details</Text>
              </TouchableOpacity>
            </View>

            {/* Scan Another Button */}
            <TouchableOpacity style={styles.scanAnotherButton} onPress={resetScan}>
              <MaterialIcons name="camera-alt" size={24} color="#fff" />
              <Text style={styles.scanAnotherText}>Scan Another Vehicle</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Camera Scanner Modal */}
      <Modal
        visible={showCamera}
        animationType="slide"
        onRequestClose={() => setShowCamera(false)}
      >
        <CameraScanner
          onScanComplete={handleScanComplete}
          onClose={() => setShowCamera(false)}
        />
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmation}
        animationType="slide"
        onRequestClose={() => setShowConfirmation(false)}
      >
        {scanData && (
          <ScanConfirmation
            photoUri={scanData.photoPath}
            plateNumber={scanData.plateNumber}
            vehicleMake={scanData.vehicleMake}
            vehicleModel={scanData.vehicleModel}
            vehicleColor={scanData.vehicleColor}
            onConfirm={handleConfirmationComplete}
            onCancel={() => setShowConfirmation(false)}
          />
        )}
      </Modal>

      {/* Zone Selector Modal */}
      <Modal
        visible={showZoneSelector}
        animationType="slide"
        transparent
        onRequestClose={() => setShowZoneSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Zone</Text>
              <TouchableOpacity onPress={() => setShowZoneSelector(false)}>
                <MaterialIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.zoneList}>
              <TouchableOpacity
                style={[
                  styles.zoneItem,
                  currentZone?.id === 'other_location' && styles.zoneItemSelected,
                ]}
                onPress={() => {
                  setCurrentZone({ id: 'other_location', name: 'Other Location' });
                  setShowZoneSelector(false);
                }}
              >
                <MaterialIcons name="help-outline" size={24} color="#999" />
                <Text style={styles.zoneItemText}>Other Location</Text>
                {currentZone?.id === 'other_location' && (
                  <MaterialIcons name="check" size={24} color="#00b4d8" />
                )}
              </TouchableOpacity>
              {availableZones.map((zone) => (
                <TouchableOpacity
                  key={zone.id}
                  style={[
                    styles.zoneItem,
                    currentZone?.id === zone.id && styles.zoneItemSelected,
                  ]}
                  onPress={() => {
                    setCurrentZone(zone);
                    setShowZoneSelector(false);
                  }}
                >
                  <MaterialIcons name="place" size={24} color="#00b4d8" />
                  <Text style={styles.zoneItemText}>{zone.name}</Text>
                  {currentZone?.id === zone.id && (
                    <MaterialIcons name="check" size={24} color="#00b4d8" />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.createZoneButton}
                onPress={() => {
                  setShowZoneSelector(false);
                  router.push('/zone-create');
                }}
              >
                <MaterialIcons name="add-circle-outline" size={24} color="#00b4d8" />
                <Text style={styles.createZoneText}>Create New Zone</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  primaryScanButton: {
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 24,
    shadowColor: '#00b4d8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  scanButtonIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonContent: {
    flex: 1,
  },
  scanButtonTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
  },
  scanButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  zoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#00b4d8',
  },
  zoneCardContent: {
    flex: 1,
  },
  zoneCardTitle: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  zoneCardName: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginTop: 2,
  },
  flaggedCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#f44336',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  flaggedText: {
    flex: 1,
    marginLeft: 12,
  },
  flaggedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f44336',
  },
  flaggedReason: {
    fontSize: 14,
    color: '#fff',
    marginTop: 4,
  },
  flaggedPriority: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  complianceCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
  },
  complianceGood: {
    borderColor: '#4caf50',
  },
  complianceBreach: {
    borderColor: '#f44336',
  },
  complianceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  complianceHeaderText: {
    flex: 1,
  },
  complianceStatus: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  compliancePlate: {
    fontSize: 16,
    color: '#00b4d8',
    fontWeight: '600',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  metric: {
    flex: 1,
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00b4d8',
  },
  metricLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  violationsSection: {
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  violationsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f44336',
    marginBottom: 8,
  },
  violationItem: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 4,
  },
  exemptionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  exemptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00b4d8',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  actionButtonWarning: {
    borderColor: '#f44336',
  },
  actionButtonSecondary: {
    borderColor: '#666',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  scanAnotherButton: {
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  scanAnotherText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  zoneList: {
    padding: 16,
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
    gap: 12,
  },
  zoneItemSelected: {
    borderColor: '#00b4d8',
    backgroundColor: '#00b4d822',
  },
  zoneItemText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  createZoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#00b4d8',
    gap: 8,
  },
  createZoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00b4d8',
  },
});
