import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Image, Switch, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getDatabase } from '@/services/database';

interface ScanConfirmationProps {
  photoUri: string;
  plateNumber: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleYear?: string;
  onConfirm: (data: {
    plateNumber: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleColor: string;
    vehicleYear: string;
    selfContained: boolean;
    selfContainedExpiry: string;
    homelessClaimed: boolean;
    homelessNotes: string;
  }) => void;
  onCancel: () => void;
}

export default function ScanConfirmation({
  photoUri,
  plateNumber: initialPlate,
  vehicleMake: initialMake,
  vehicleModel: initialModel,
  vehicleColor: initialColor,
  vehicleYear: initialYear,
  onConfirm,
  onCancel,
}: ScanConfirmationProps) {
  const [plateNumber, setPlateNumber] = useState(initialPlate || '');
  const [vehicleMake, setVehicleMake] = useState(initialMake || '');
  const [vehicleModel, setVehicleModel] = useState(initialModel || '');
  const [vehicleColor, setVehicleColor] = useState(initialColor || '');
  const [vehicleYear, setVehicleYear] = useState(initialYear || '');
  const [selfContained, setSelfContained] = useState(false);
  const [selfContainedExpiry, setSelfContainedExpiry] = useState('');
  const [homelessClaimed, setHomelessClaimed] = useState(false);
  const [homelessNotes, setHomelessNotes] = useState('');
  const [existingRecord, setExistingRecord] = useState<any>(null);

  useEffect(() => {
    loadExistingRecord();
  }, [plateNumber]);

  const loadExistingRecord = async () => {
    if (!plateNumber) return;

    try {
      const db = getDatabase();
      const record = await db.getFirstAsync<any>(
        'SELECT * FROM canonical_vehicles WHERE plate_number = ?',
        plateNumber.toUpperCase()
      );

      if (record) {
        setExistingRecord(record);
        // Pre-fill with existing data
        if (!vehicleMake && record.vehicle_make) setVehicleMake(record.vehicle_make);
        if (!vehicleModel && record.vehicle_model) setVehicleModel(record.vehicle_model);
        if (!vehicleColor && record.vehicle_color) setVehicleColor(record.vehicle_color);
        if (!vehicleYear && record.vehicle_year) setVehicleYear(record.vehicle_year.toString());
        
        setSelfContained(record.self_contained === 1);
        if (record.self_contained_expiry) {
          setSelfContainedExpiry(new Date(record.self_contained_expiry).toISOString().split('T')[0]);
        }
        
        if (record.homeless_status === 'claimed') {
          setHomelessClaimed(true);
          setHomelessNotes(record.homeless_notes || '');
        }
      }
    } catch (error) {
      console.error('Error loading existing record:', error);
    }
  };

  const handleConfirm = () => {
    if (!plateNumber.trim()) {
      Alert.alert('Error', 'Please enter a plate number');
      return;
    }

    if (selfContained && !selfContainedExpiry) {
      Alert.alert('Error', 'Please enter self-contained certificate expiry date');
      return;
    }

    onConfirm({
      plateNumber: plateNumber.toUpperCase(),
      vehicleMake,
      vehicleModel,
      vehicleColor,
      vehicleYear,
      selfContained,
      selfContainedExpiry,
      homelessClaimed,
      homelessNotes,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Confirm Vehicle Details</Text>
        <TouchableOpacity onPress={onCancel}>
          <MaterialIcons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Photo Preview */}
        <View style={styles.photoSection}>
          <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          {existingRecord && (
            <View style={styles.existingBadge}>
              <MaterialIcons name="history" size={16} color="#00b4d8" />
              <Text style={styles.existingText}>Existing Record</Text>
            </View>
          )}
        </View>

        {/* Plate Number */}
        <View style={styles.section}>
          <Text style={styles.label}>License Plate *</Text>
          <TextInput
            style={styles.input}
            value={plateNumber}
            onChangeText={(text) => setPlateNumber(text.toUpperCase())}
            placeholder="ABC123"
            placeholderTextColor="#666"
            autoCapitalize="characters"
            maxLength={10}
          />
        </View>

        {/* Vehicle Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle Details</Text>
          
          <Text style={styles.label}>Make</Text>
          <TextInput
            style={styles.input}
            value={vehicleMake}
            onChangeText={setVehicleMake}
            placeholder="Toyota"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>Model</Text>
          <TextInput
            style={styles.input}
            value={vehicleModel}
            onChangeText={setVehicleModel}
            placeholder="Hiace"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>Color</Text>
          <TextInput
            style={styles.input}
            value={vehicleColor}
            onChangeText={setVehicleColor}
            placeholder="White"
            placeholderTextColor="#666"
          />

          <Text style={styles.label}>Year</Text>
          <TextInput
            style={styles.input}
            value={vehicleYear}
            onChangeText={setVehicleYear}
            placeholder="2015"
            placeholderTextColor="#666"
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>

        {/* Self-Contained Status */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <MaterialIcons name="verified" size={24} color={selfContained ? '#4caf50' : '#666'} />
              <Text style={styles.label}>Self-Contained Certificate</Text>
            </View>
            <Switch
              value={selfContained}
              onValueChange={setSelfContained}
              trackColor={{ false: '#333', true: '#4caf5080' }}
              thumbColor={selfContained ? '#4caf50' : '#999'}
            />
          </View>

          {selfContained && (
            <>
              <Text style={styles.label}>Expiry Date *</Text>
              <TextInput
                style={styles.input}
                value={selfContainedExpiry}
                onChangeText={setSelfContainedExpiry}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#666"
              />
              <Text style={styles.hint}>Format: 2025-12-31</Text>
            </>
          )}
        </View>

        {/* Homeless Status */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <MaterialIcons name="info" size={24} color={homelessClaimed ? '#ff9800' : '#666'} />
              <Text style={styles.label}>Owner Claims Homeless Status</Text>
            </View>
            <Switch
              value={homelessClaimed}
              onValueChange={setHomelessClaimed}
              trackColor={{ false: '#333', true: '#ff980080' }}
              thumbColor={homelessClaimed ? '#ff9800' : '#999'}
            />
          </View>

          {homelessClaimed && (
            <>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={homelessNotes}
                onChangeText={setHomelessNotes}
                placeholder="Additional information about homeless claim..."
                placeholderTextColor="#666"
                multiline
                numberOfLines={3}
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
          <MaterialIcons name="check" size={24} color="#fff" />
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </TouchableOpacity>
      </View>
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
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  photoSection: {
    position: 'relative',
    marginBottom: 24,
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  existingBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 180, 216, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  existingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  switchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#00b4d8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
